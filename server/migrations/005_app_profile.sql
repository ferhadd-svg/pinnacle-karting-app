-- App layout additions: venue branding for the store, track outlines for leaderboard cards,
-- multi-session ticket packs, promotions, and per-use ticket history.

ALTER TABLE venues ADD COLUMN short_name text;
-- e.g. 'indoor', 'outdoor', 'hybrid', 'circuit' — shown on the store's venue cards
ALTER TABLE venues ADD COLUMN kind text NOT NULL DEFAULT 'indoor' CHECK (kind IN ('indoor', 'outdoor', 'hybrid', 'circuit'));
ALTER TABLE venues ADD COLUMN accent_color text NOT NULL DEFAULT '#3ee07f' CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE venues ADD COLUMN tagline text NOT NULL DEFAULT '';
ALTER TABLE venues ADD COLUMN sort int NOT NULL DEFAULT 0;

-- Track outline as an SVG path in a 0..100 × 0..100 box, drawn on the leaderboard cards.
ALTER TABLE tracks ADD COLUMN map_path text;

-- Ticket packs: one ticket can cover several sessions ("SESSIONS USED 1/3").
ALTER TABLE products ADD COLUMN sessions int NOT NULL DEFAULT 1 CHECK (sessions BETWEEN 1 AND 20);
ALTER TABLE tickets ADD COLUMN sessions_total int NOT NULL DEFAULT 1 CHECK (sessions_total BETWEEN 1 AND 20);
ALTER TABLE tickets ADD COLUMN sessions_used int NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD CONSTRAINT tickets_sessions_used_range CHECK (sessions_used BETWEEN 0 AND sessions_total);
UPDATE tickets SET sessions_used = 1 WHERE status = 'used';

-- Every check-in scan of a ticket, so packs keep a full history.
CREATE TABLE ticket_uses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES tickets(id),
  used_at         timestamptz NOT NULL DEFAULT now(),
  used_by         uuid REFERENCES users(id),
  participant_id  uuid REFERENCES session_participants(id)
);
CREATE INDEX ticket_uses_ticket ON ticket_uses (ticket_id, used_at);

CREATE TABLE promotions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid REFERENCES venues(id),        -- NULL = all venues
  title        text NOT NULL,
  subtitle     text NOT NULL DEFAULT '',
  badge        text NOT NULL DEFAULT '',          -- short highlight, e.g. 'BUY 1 FREE 1'
  color        text NOT NULL DEFAULT '#3ee07f' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  starts_at    timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz,
  sort         int NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true
);
