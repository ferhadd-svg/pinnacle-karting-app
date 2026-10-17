-- Customer features: digital waivers, ticket products, orders & receipts, tickets (buy, redeem kiosk
-- codes, transfer, use at check-in), reward tokens, reward catalogue and friends.

-- Short codes for tickets and reward vouchers. Uniqueness comes from the table constraints.
CREATE FUNCTION new_short_code(len int) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
    FROM generate_series(1, len)
$$;

-- ── Waivers ───────────────────────────────────────────────────────────────
CREATE TABLE waiver_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid NOT NULL REFERENCES venues(id),
  version     int NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  valid_days  int NOT NULL DEFAULT 365 CHECK (valid_days > 0),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, version)
);

-- Signed copies are never edited; re-signing adds a row.
CREATE TABLE waiver_signatures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid NOT NULL REFERENCES waiver_templates(id),
  driver_id      uuid NOT NULL REFERENCES drivers(id),
  signed_name    text NOT NULL,
  guardian_name  text,
  signed_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  user_agent     text
);
CREATE INDEX waiver_signatures_driver ON waiver_signatures (driver_id, expires_at DESC);

-- ── Products, orders, tickets ─────────────────────────────────────────────
CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES venues(id),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  session_type  session_type NOT NULL,
  price_sen     int NOT NULL CHECK (price_sen >= 0),
  min_age       int,
  active        boolean NOT NULL DEFAULT true,
  sort          int NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id),
  venue_id          uuid NOT NULL REFERENCES venues(id),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  total_sen         int NOT NULL CHECK (total_sen >= 0),
  currency          char(3) NOT NULL DEFAULT 'MYR',
  payment_provider  text,
  payment_ref       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz,
  UNIQUE (payment_provider, payment_ref)
);
CREATE INDEX orders_user ON orders (user_id, created_at DESC);

CREATE TABLE order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id),
  name            text NOT NULL,            -- snapshot for the receipt
  unit_price_sen  int NOT NULL,
  quantity        int NOT NULL CHECK (quantity BETWEEN 1 AND 20)
);

CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE DEFAULT new_short_code(8),
  venue_id        uuid NOT NULL REFERENCES venues(id),
  product_id      uuid NOT NULL REFERENCES products(id),
  order_id        uuid REFERENCES orders(id),
  -- NULL until claimed: kiosk/counter tickets are redeemed into an account with their code
  owner_driver_id uuid REFERENCES drivers(id),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'void')),
  issued_at       timestamptz NOT NULL DEFAULT now(),
  issued_by       uuid REFERENCES users(id),
  claimed_at      timestamptz,
  used_at         timestamptz,
  used_by         uuid REFERENCES users(id),
  participant_id  uuid REFERENCES session_participants(id)
);
CREATE INDEX tickets_owner ON tickets (owner_driver_id, status);

CREATE TABLE ticket_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES tickets(id),
  from_driver_id  uuid NOT NULL REFERENCES drivers(id),
  to_driver_id    uuid NOT NULL REFERENCES drivers(id),
  at              timestamptz NOT NULL DEFAULT now()
);

-- ── Rewards ───────────────────────────────────────────────────────────────
-- Balance = SUM(delta). `ref` makes every award idempotent (e.g. 'session:<id>:participation').
CREATE TABLE token_ledger (
  id          bigserial PRIMARY KEY,
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  delta       int NOT NULL CHECK (delta <> 0),
  reason      text NOT NULL,
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, ref)
);

CREATE TABLE reward_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES venues(id),
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  cost_tokens  int NOT NULL CHECK (cost_tokens > 0),
  active       boolean NOT NULL DEFAULT true,
  sort         int NOT NULL DEFAULT 0
);

CREATE TABLE reward_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES reward_items(id),
  driver_id     uuid NOT NULL REFERENCES drivers(id),
  code          text NOT NULL UNIQUE DEFAULT new_short_code(8),
  cost_tokens   int NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  fulfilled_at  timestamptz,
  fulfilled_by  uuid REFERENCES users(id)
);

-- ── Friends ───────────────────────────────────────────────────────────────
CREATE TABLE friendships (
  requester_id  uuid NOT NULL REFERENCES drivers(id),
  addressee_id  uuid NOT NULL REFERENCES drivers(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
-- One relationship per pair, whichever side asked.
CREATE UNIQUE INDEX friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
