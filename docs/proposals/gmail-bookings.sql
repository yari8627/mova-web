-- Additive proposal; not applied. Use only an explicitly selected isolated local DB.
-- Production application requires a separate release. Do not run SQLite migrations.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA nami_gmail;
REVOKE ALL ON SCHEMA nami_gmail FROM PUBLIC;
CREATE TABLE nami_gmail.connection (
 user_id text PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,
 id uuid NOT NULL UNIQUE, account_hash text NOT NULL, ciphertext text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE nami_gmail.oauth_state (
 state_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
 session_hash text NOT NULL, ciphertext text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX oauth_state_expiry ON nami_gmail.oauth_state(expires_at);
CREATE TABLE nami_gmail.import_record (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
 account_hash text NOT NULL, source_key text NOT NULL, fingerprint text NOT NULL,
 -- Keep the stable booking ID even when the legacy manual sync replaces rows with
 -- the same IDs. The import transaction validates/creates its target atomically.
 reference_key text NOT NULL, booking_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,account_hash,source_key), UNIQUE(user_id,account_hash,fingerprint)
);
CREATE INDEX import_reference ON nami_gmail.import_record(user_id,account_hash,reference_key);
REVOKE ALL ON ALL TABLES IN SCHEMA nami_gmail FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
  EXECUTE format('REVOKE ALL ON SCHEMA nami_gmail FROM %I',r);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA nami_gmail FROM %I',r);
 END IF; END LOOP; END $$;
-- Existing trusted server database role owns these private tables. A separate migration
-- role requires explicit USAGE/DML for that server role only. No browser grants or roles.
COMMIT;
