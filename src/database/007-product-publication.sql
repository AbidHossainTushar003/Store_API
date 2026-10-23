ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_public_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_approval_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_approval_updated_by varchar(255);

CREATE TABLE IF NOT EXISTS product_publication_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id varchar(80) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  actor_sub varchar(255) NOT NULL,
  action varchar(32) NOT NULL
    CHECK (action IN ('approved', 'revoked', 'content_change_suspension')),
  reason varchar(1000) NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  previous_state boolean NOT NULL,
  resulting_state boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_publication_audit_product_created_idx
  ON product_publication_audit(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS products_public_catalog_idx
  ON products(id)
  WHERE is_demo = false
    AND is_public_approved = true
    AND status = 'active'
    AND stock_quantity > 0;
