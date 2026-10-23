CREATE TABLE IF NOT EXISTS seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_sub varchar(255) NOT NULL UNIQUE,
  applicant_name varchar(160) NOT NULL CHECK (length(btrim(applicant_name)) BETWEEN 2 AND 160),
  applicant_email varchar(320) NOT NULL,
  shop_name varchar(120) NOT NULL CHECK (length(btrim(shop_name)) BETWEEN 2 AND 120),
  description varchar(2000) NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 2000),
  status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_applications_status_submitted_idx
  ON seller_applications(status, submitted_at);
