ALTER TABLE products
  ADD COLUMN IF NOT EXISTS seller_id varchar(80),
  ADD COLUMN IF NOT EXISTS sku varchar(80),
  ADD COLUMN IF NOT EXISTS price_bdt integer CHECK (price_bdt IS NULL OR price_bdt > 0),
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'inactive'));

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference varchar(32) NOT NULL UNIQUE,
  guest_session_id uuid NOT NULL REFERENCES guest_sessions(id),
  seller_id varchar(80) NOT NULL,
  buyer_name varchar(160) NOT NULL CHECK (length(btrim(buyer_name)) BETWEEN 2 AND 160),
  buyer_email varchar(320) NOT NULL,
  buyer_phone varchar(32) NOT NULL,
  delivery_address varchar(1000) NOT NULL,
  total_bdt integer NOT NULL CHECK (total_bdt > 0),
  status varchar(32) NOT NULL DEFAULT 'pending_seller_confirmation'
    CHECK (status IN ('pending_seller_confirmation', 'pending_admin_confirmation', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  seller_confirmed_at timestamptz,
  admin_confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id varchar(80) NOT NULL REFERENCES products(id),
  product_title text NOT NULL,
  unit_price_bdt integer NOT NULL CHECK (unit_price_bdt > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total_bdt integer NOT NULL CHECK (line_total_bdt > 0)
);

CREATE INDEX IF NOT EXISTS products_seller_status_idx
  ON products(seller_id, status)
  WHERE seller_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_seller_status_created_idx
  ON orders(seller_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_guest_created_idx
  ON orders(guest_session_id, created_at DESC);
