ALTER TABLE seller_applications
  DROP CONSTRAINT IF EXISTS seller_applications_status_check;

ALTER TABLE seller_applications
  ADD CONSTRAINT seller_applications_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE product_publication_audit
  DROP CONSTRAINT IF EXISTS product_publication_audit_action_check;

ALTER TABLE product_publication_audit
  ADD CONSTRAINT product_publication_audit_action_check
  CHECK (action IN (
    'approved',
    'revoked',
    'content_change_suspension',
    'seller_eligibility_suspension'
  ));

CREATE TABLE IF NOT EXISTS seller_application_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES seller_applications(id) ON DELETE RESTRICT,
  actor_sub varchar(255) NOT NULL,
  action varchar(32) NOT NULL
    CHECK (action IN ('approved', 'rejected', 'suspended', 'reactivated')),
  reason varchar(1000) NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  previous_state varchar(24) NOT NULL
    CHECK (previous_state IN ('pending', 'approved', 'rejected', 'suspended')),
  resulting_state varchar(24) NOT NULL
    CHECK (resulting_state IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_application_audit_application_created_idx
  ON seller_application_audit(application_id, created_at DESC);
