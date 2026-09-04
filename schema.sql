CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','seller','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY,name VARCHAR(100) UNIQUE NOT NULL,slug VARCHAR(120) UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,name VARCHAR(200) NOT NULL,description TEXT DEFAULT '',
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,phone VARCHAR(30) NOT NULL,county VARCHAR(100) NOT NULL,town VARCHAR(100) NOT NULL,address_line TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),address_id UUID REFERENCES addresses(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','processing','shipped','out_for_delivery','delivered','cancelled')),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),seller_id UUID NOT NULL REFERENCES users(id),quantity INT NOT NULL CHECK (quantity > 0),unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL,status VARCHAR(30) NOT NULL DEFAULT 'pending',transaction_reference VARCHAR(120),amount NUMERIC(12,2) NOT NULL,
  merchant_request_id VARCHAR(120),checkout_request_id VARCHAR(120),mpesa_receipt_number VARCHAR(120),result_code VARCHAR(60),result_desc TEXT,phone_number VARCHAR(30),transaction_date VARCHAR(30),callback_payload JSONB,paid_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,changed_by UUID REFERENCES users(id) ON DELETE SET NULL,note TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Backward-compatible column migrations for existing v4.x databases.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'customer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS merchant_request_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_receipt_number VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS result_code VARCHAR(60);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS result_desc TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_date VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_payload JSONB;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS payments_checkout_request_id_uidx ON payments(checkout_request_id) WHERE checkout_request_id IS NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS changed_by UUID;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),comment TEXT DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(product_id,user_id)
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','paid','processing','shipped','out_for_delivery','delivered','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO categories(name,slug) VALUES ('Electronics','electronics'),('Fashion','fashion'),('Home','home'),('Beauty','beauty'),('Groceries','groceries'),('Phones','phones') ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS wishlist (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,product_id));
