-- Optional bookings & payments module (Phase 4). Tables exist so sessions can link to bookings;
-- no payment card data is ever stored — only the payment provider's reference.

CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid NOT NULL REFERENCES venues(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  session_id       uuid REFERENCES sessions(id),
  session_type     session_type NOT NULL,
  starts_at        timestamptz NOT NULL,
  drivers          int NOT NULL CHECK (drivers BETWEEN 1 AND 50),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'checked_in', 'cancelled', 'no_show')),
  total_sen        int NOT NULL CHECK (total_sen >= 0),
  currency         char(3) NOT NULL DEFAULT 'MYR',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_user ON bookings (user_id, starts_at DESC);

CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES bookings(id),
  provider           text NOT NULL,             -- e.g. 'billplz', 'stripe', 'ipay88'
  provider_ref       text NOT NULL,
  amount_sen         int NOT NULL,
  status             text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

ALTER TABLE session_participants ADD COLUMN booking_id uuid REFERENCES bookings(id);
