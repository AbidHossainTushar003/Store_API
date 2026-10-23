CREATE TABLE IF NOT EXISTS super_admin_identities (
  auth0_sub varchar(255) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS super_admin_bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  consumed_at timestamptz,
  consumed_by varchar(255)
);

INSERT INTO super_admin_bootstrap_state (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_sub varchar(255) NOT NULL REFERENCES super_admin_identities(auth0_sub),
  action varchar(100) NOT NULL,
  target_type varchar(100) NOT NULL,
  target_id varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS super_admin_audit_log_created_idx
  ON super_admin_audit_log(created_at DESC);
