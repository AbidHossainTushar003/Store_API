CREATE TABLE IF NOT EXISTS products (
  id varchar(80) PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  category varchar(120) NOT NULL,
  brand varchar(160),
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  guest_session_id uuid NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
  product_id varchar(80) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_session_id, product_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  guest_session_id uuid NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
  product_id varchar(80) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_session_id, product_id)
);

CREATE INDEX IF NOT EXISTS guest_sessions_expires_at_idx ON guest_sessions(expires_at);

INSERT INTO products (id, title, description, category, brand, is_demo)
VALUES
  ('sample-notebook', 'Everyday notebook', 'A simple example for notes and ideas.', 'Books & stationery', 'Northstar Studio', true),
  ('sample-desk-organizer', 'Desk organizer', 'A tidy-home product card example.', 'Home & living', 'Everyday Form', true),
  ('sample-cable-case', 'Travel cable case', 'An everyday accessory card example.', 'Tech accessories', NULL, true),
  ('sample-canvas-bag', 'Canvas carry bag', 'A simple reusable-bag card example.', 'Everyday style', 'Field Notes Goods', true)
ON CONFLICT (id) DO NOTHING;
