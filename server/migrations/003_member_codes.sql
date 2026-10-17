-- Member codes: a short code (and QR) a customer shows at check-in so staff can put their laps on
-- their account. Alphabet avoids look-alikes (0/O, 1/I/L).

CREATE FUNCTION new_member_code() RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM drivers WHERE member_code = code);
  END LOOP;
  RETURN code;
END $$;

ALTER TABLE drivers ADD COLUMN member_code text;
UPDATE drivers SET member_code = new_member_code() WHERE member_code IS NULL;
ALTER TABLE drivers ALTER COLUMN member_code SET DEFAULT new_member_code();
ALTER TABLE drivers ALTER COLUMN member_code SET NOT NULL;
ALTER TABLE drivers ADD CONSTRAINT drivers_member_code_key UNIQUE (member_code);

-- A walk-in profile whose results were moved to a member's account.
ALTER TABLE drivers ADD COLUMN merged_into uuid REFERENCES drivers(id);
