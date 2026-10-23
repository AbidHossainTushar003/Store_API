CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference varchar(24) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  email varchar(254) NOT NULL,
  category varchar(32) NOT NULL CHECK (
    category IN (
      'general',
      'order',
      'shipping',
      'returns',
      'payments',
      'account',
      'seller_registration',
      'other'
    )
  ),
  subject varchar(160) NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  notification_sent boolean NOT NULL DEFAULT false,
  notification_attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS support_tickets_expires_at_idx
  ON support_tickets(expires_at);
