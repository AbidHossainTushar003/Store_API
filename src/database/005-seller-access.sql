ALTER TABLE products
  ALTER COLUMN seller_id TYPE varchar(255);

ALTER TABLE orders
  ALTER COLUMN seller_id TYPE varchar(255);
