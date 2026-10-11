-- Core timing schema: venues, hardware, sessions, raw events, derived laps/results, audit.
-- Conventions: uuid keys for business entities, bigserial for high-volume event rows,
-- timing instants stored as bigint microseconds since epoch in the TIMING DEVICE's clock (*_us).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('driver', 'operator', 'admin');
CREATE TYPE session_type AS ENUM ('practice', 'rental', 'qualifying', 'sprint', 'endurance');
-- scheduled → running → finished (chequered; results provisional) → final. Any pre-final → cancelled.
CREATE TYPE session_status AS ENUM ('scheduled', 'running', 'finished', 'final', 'cancelled');
CREATE TYPE loop_role AS ENUM ('finish', 'pit_in', 'pit_out', 'split');
CREATE TYPE correction_kind AS ENUM (
  'exclude_event',   -- ignore a raw crossing (ghost read, wrong kart)
  'add_crossing',    -- insert a manual crossing (missed detection), never touches raw events
  'invalidate_lap',  -- lap stays in distance but can't be fastest/record (e.g. track limits)
  'time_penalty',    -- races: add value_us to total time
  'lap_penalty',     -- races: deduct value_int laps
  'disqualify'
);

CREATE TABLE venues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  timezone    text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          user_role NOT NULL DEFAULT 'driver',
  -- operators are scoped to one venue; admins and drivers are not
  venue_id      uuid REFERENCES venues(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,
  CONSTRAINT operator_has_venue CHECK (role <> 'operator' OR venue_id IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- A driver can exist without an app account (walk-in customer) and be claimed later.
CREATE TABLE drivers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid UNIQUE REFERENCES users(id),
  display_name         text NOT NULL,
  birth_year           int CHECK (birth_year BETWEEN 1900 AND 2100),
  show_on_leaderboards boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- One row per layout: records are only comparable within the same layout.
CREATE TABLE tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES venues(id),
  name          text NOT NULL,
  layout        text NOT NULL DEFAULT 'standard',
  length_m      int,
  active        boolean NOT NULL DEFAULT true,
  -- default LapRules for new sessions on this track (see server/src/timing/types.ts)
  default_rules jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name, layout)
);

-- Maps the decoder's loop/timing-point identifier to its meaning on this track.
CREATE TABLE timing_loops (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id  uuid NOT NULL REFERENCES tracks(id),
  code      text NOT NULL,
  role      loop_role NOT NULL,
  UNIQUE (track_id, code)
);

CREATE TABLE kart_classes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id  uuid NOT NULL REFERENCES venues(id),
  name      text NOT NULL,
  UNIQUE (venue_id, name)
);

CREATE TABLE karts (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id  uuid NOT NULL REFERENCES venues(id),
  number    text NOT NULL,
  class_id  uuid REFERENCES kart_classes(id),
  status    text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  UNIQUE (venue_id, number)
);

CREATE TABLE transponders (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id  uuid NOT NULL REFERENCES venues(id),
  -- the ID exactly as the decoder reports it
  code      text NOT NULL,
  kind      text,
  status    text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'retired')),
  UNIQUE (venue_id, code)
);

-- Which kart carries which transponder, over time. Never updated in place except to close the range.
CREATE TABLE transponder_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transponder_id uuid NOT NULL REFERENCES transponders(id),
  kart_id        uuid NOT NULL REFERENCES karts(id),
  valid_during   tstzrange NOT NULL,
  note           text,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (transponder_id WITH =, valid_during WITH &&),
  EXCLUDE USING gist (kart_id WITH =, valid_during WITH &&)
);

CREATE TABLE timing_devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid NOT NULL REFERENCES venues(id),
  track_id         uuid NOT NULL REFERENCES tracks(id),
  name             text NOT NULL,
  -- e.g. 'csv-import', 'gateway:mylaps-p3', 'gateway:vendor-api'
  provider         text NOT NULL,
  api_key_hash     text UNIQUE,
  -- device clock minus server clock, reported by the gateway heartbeat
  clock_offset_us  bigint NOT NULL DEFAULT 0,
  last_seen_at     timestamptz,
  last_sequence    bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  disabled_at      timestamptz
);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id            uuid NOT NULL REFERENCES tracks(id),
  kart_class_id       uuid REFERENCES kart_classes(id),
  type                session_type NOT NULL,
  status              session_status NOT NULL DEFAULT 'scheduled',
  name                text NOT NULL,
  scheduled_start     timestamptz,
  started_at          timestamptz,
  ended_at            timestamptz,
  finalized_at        timestamptz,
  finalized_by        uuid REFERENCES users(id),
  -- device-clock offset snapshotted at start so boundaries never shift retroactively
  clock_offset_us     bigint NOT NULL DEFAULT 0,
  rules               jsonb NOT NULL DEFAULT '{}',
  results_version     int NOT NULL DEFAULT 0,
  results_updated_at  timestamptz,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR started_at IS NOT NULL),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX sessions_track_status ON sessions (track_id, status, started_at DESC);

-- An entry in a session: a solo driver, or a team in endurance.
CREATE TABLE session_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  -- solo driver; for teams this is the default when no stint covers a lap
  driver_id     uuid REFERENCES drivers(id),
  team_name     text,
  status        text NOT NULL DEFAULT 'entered' CHECK (status IN ('entered', 'dns', 'dnf')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (driver_id IS NOT NULL OR team_name IS NOT NULL)
);
CREATE INDEX session_participants_driver ON session_participants (driver_id);
CREATE UNIQUE INDEX session_participants_solo ON session_participants (session_id, driver_id) WHERE team_name IS NULL;

-- Which kart/transponder a participant is using, over time (kart swaps create a new row).
-- The transponder is snapshotted so later reassignments never rewrite history.
-- active_during is NULL until the session starts; the exclusion constraint then guarantees a
-- transponder belongs to exactly one participant at any instant, across all sessions.
CREATE TABLE participant_karts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  uuid NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  kart_id         uuid NOT NULL REFERENCES karts(id),
  transponder_id  uuid REFERENCES transponders(id),
  active_during   tstzrange,
  created_at      timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (transponder_id WITH =, active_during WITH &&)
);
CREATE INDEX participant_karts_participant ON participant_karts (participant_id);

-- Endurance driver stints, recorded by the pit-lane operator. Lap attribution uses lap end time.
CREATE TABLE stints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  uuid NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  driver_id       uuid NOT NULL REFERENCES drivers(id),
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  recorded_by     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Raw crossings exactly as received. Immutable: corrections live in timing_corrections.
CREATE TABLE raw_timing_events (
  id                bigserial PRIMARY KEY,
  device_id         uuid NOT NULL REFERENCES timing_devices(id),
  -- idempotency key from the source (decoder passing id / sequence / content hash)
  event_key         text NOT NULL,
  transponder_code  text NOT NULL,
  loop_code         text NOT NULL,
  detected_us       bigint NOT NULL,
  detected_at       timestamptz GENERATED ALWAYS AS (to_timestamp(detected_us / 1000000.0)) STORED,
  sequence          bigint,
  source_status     text,
  ingest_batch      uuid,
  received_at       timestamptz NOT NULL DEFAULT now(),
  payload           jsonb,
  UNIQUE (device_id, event_key)
);
CREATE INDEX raw_events_lookup ON raw_timing_events (transponder_code, detected_us);
CREATE INDEX raw_events_device_time ON raw_timing_events (device_id, detected_us);

CREATE FUNCTION forbid_raw_event_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'raw_timing_events is append-only; record a timing_correction instead';
END $$;
CREATE TRIGGER raw_timing_events_immutable
  BEFORE UPDATE OR DELETE ON raw_timing_events
  FOR EACH ROW EXECUTE FUNCTION forbid_raw_event_changes();

-- Operator corrections. Append-only; a correction is withdrawn by setting revoked_*.
CREATE TABLE timing_corrections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES sessions(id),
  participant_id   uuid REFERENCES session_participants(id),
  kind             correction_kind NOT NULL,
  -- exclude_event: 'r:<raw id>' or 'm:<correction id>'; invalidate_lap: ref of the lap's end crossing
  target_ref       text,
  crossing_us      bigint,
  crossing_loop    loop_role,
  value_us         bigint,
  value_int        int,
  reason           text NOT NULL,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES users(id),
  revoke_reason    text,
  CHECK (kind <> 'add_crossing' OR (participant_id IS NOT NULL AND crossing_us IS NOT NULL)),
  CHECK (kind NOT IN ('exclude_event', 'invalidate_lap') OR target_ref IS NOT NULL)
);
CREATE INDEX timing_corrections_session ON timing_corrections (session_id);

-- Derived: rebuilt from raw events + corrections on every recalculation.
CREATE TABLE laps (
  id              bigserial PRIMARY KEY,
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  driver_id       uuid REFERENCES drivers(id),
  kart_id         uuid REFERENCES karts(id),
  lap_number      int NOT NULL,
  start_ref       text,
  end_ref         text NOT NULL,
  started_us      bigint NOT NULL,
  ended_us        bigint NOT NULL,
  duration_us     bigint NOT NULL CHECK (duration_us > 0),
  flags           text[] NOT NULL DEFAULT '{}',
  valid           boolean NOT NULL,
  invalid_reason  text,
  UNIQUE (participant_id, lap_number)
);
CREATE INDEX laps_session ON laps (session_id);
CREATE INDEX laps_driver_best ON laps (driver_id, duration_us) WHERE valid;

-- Derived: standings for the session. Provisional or final according to sessions.status.
CREATE TABLE session_results (
  session_id       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id   uuid NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  position         int,
  laps_completed   int NOT NULL,
  best_lap_us      bigint,
  best_lap_number  int,
  avg_lap_us       bigint,
  total_time_us    bigint,
  gap_us           bigint,
  gap_laps         int NOT NULL DEFAULT 0,
  has_fastest_lap  boolean NOT NULL DEFAULT false,
  disqualified     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id, participant_id)
);

CREATE TABLE audit_log (
  id               bigserial PRIMARY KEY,
  at               timestamptz NOT NULL DEFAULT now(),
  actor_user_id    uuid REFERENCES users(id),
  actor_device_id  uuid REFERENCES timing_devices(id),
  action           text NOT NULL,
  entity_type      text NOT NULL,
  entity_id        text,
  before           jsonb,
  after            jsonb,
  reason           text
);
CREATE INDEX audit_log_entity ON audit_log (entity_type, entity_id, at DESC);
