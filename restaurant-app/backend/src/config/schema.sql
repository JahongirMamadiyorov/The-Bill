-- ============================================================
--  RESTAURANT APP - PostgreSQL Database Schema
--  Roles: Owner, Admin, Waitress
-- ============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  phone         VARCHAR(30),
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'waitress', 'kitchen')),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- WAITRESS PERMISSIONS (controlled by Admin)
-- ============================================================

CREATE TABLE waitress_permissions (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     UUID REFERENCES users(id) ON DELETE CASCADE,
  can_create_orders           BOOLEAN DEFAULT TRUE,
  can_modify_orders           BOOLEAN DEFAULT TRUE,
  can_cancel_orders           BOOLEAN DEFAULT FALSE,
  can_delete_order_items      BOOLEAN DEFAULT FALSE,
  can_add_free_items          BOOLEAN DEFAULT FALSE,
  can_apply_discounts         BOOLEAN DEFAULT FALSE,
  can_set_custom_price        BOOLEAN DEFAULT FALSE,
  can_process_payments        BOOLEAN DEFAULT TRUE,
  can_split_bills             BOOLEAN DEFAULT TRUE,
  can_issue_refunds           BOOLEAN DEFAULT FALSE,
  can_open_close_table        BOOLEAN DEFAULT TRUE,
  can_transfer_table          BOOLEAN DEFAULT TRUE,
  can_merge_tables            BOOLEAN DEFAULT FALSE,
  can_see_other_tables        BOOLEAN DEFAULT FALSE,
  can_see_sales_numbers       BOOLEAN DEFAULT FALSE,
  can_see_customer_history    BOOLEAN DEFAULT FALSE,
  updated_at                  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLES (restaurant floor plan)
-- ============================================================

CREATE TABLE restaurant_tables (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_number INT UNIQUE NOT NULL,
  capacity     INT DEFAULT 4,
  status       VARCHAR(20) DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved', 'closed')),
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_at    TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- MENU
-- ============================================================

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE menu_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  name         VARCHAR(150) NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL,
  image_url    TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id         UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  waitress_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  status           VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','sent_to_kitchen','preparing','ready','served','paid','cancelled')),
  notes            TEXT,
  order_type       VARCHAR(20) DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  guest_count      INTEGER,
  customer_name    VARCHAR(100),
  customer_phone   VARCHAR(30),
  delivery_address TEXT,
  delivery_status  VARCHAR(20) DEFAULT 'pending',
  daily_number     INTEGER,
  discount_amount  NUMERIC(10,2) DEFAULT 0,
  tax_amount       NUMERIC(10,2) DEFAULT 0,
  total_amount     NUMERIC(10,2) DEFAULT 0,
  payment_method   VARCHAR(30) CHECK (payment_method IN ('cash','card','online','split')),
  paid_at          TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  quantity     INT NOT NULL DEFAULT 1,
  unit_price   NUMERIC(10,2) NOT NULL,
  custom_price NUMERIC(10,2),
  is_free      BOOLEAN DEFAULT FALSE,
  notes        TEXT,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','served')),
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100),
  phone        VARCHAR(30) UNIQUE,
  email        VARCHAR(150),
  loyalty_pts  INT DEFAULT 0,
  visit_count  INT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE warehouse_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(150) NOT NULL,
  category          VARCHAR(50),
  sku_code          VARCHAR(100) UNIQUE,
  unit              VARCHAR(30),
  quantity_in_stock NUMERIC(10,2) DEFAULT 0,
  min_stock_level   NUMERIC(10,2) DEFAULT 5,
  low_stock_alert   NUMERIC(10,2) DEFAULT 5, -- legacy
  cost_per_unit     NUMERIC(10,2) DEFAULT 0,
  supplier_id       UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stock_movements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id    UUID REFERENCES warehouse_items(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUST', 'WASTE')),
  quantity   NUMERIC(10,2) NOT NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  reason     TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stock_batches (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id            UUID REFERENCES warehouse_items(id) ON DELETE CASCADE,
  quantity_remaining NUMERIC(10,2) NOT NULL,
  expiry_date        DATE,
  received_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE menu_item_ingredients (
  menu_item_id  UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES warehouse_items(id) ON DELETE CASCADE,
  quantity_used NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (menu_item_id, ingredient_id)
);

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(150) NOT NULL,
  phone      VARCHAR(30),
  email      VARCHAR(150),
  address    TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE purchase_orders (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  total_cost   NUMERIC(10,2) DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','received','partial')),
  notes        TEXT,
  ordered_at   TIMESTAMP DEFAULT NOW(),
  received_at  TIMESTAMP
);

CREATE TABLE purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id     UUID REFERENCES warehouse_items(id) ON DELETE SET NULL,
  quantity          NUMERIC(10,2) NOT NULL,
  unit_cost         NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- ACCOUNTING & FINANCE
-- ============================================================

CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category     VARCHAR(100) NOT NULL,  -- rent, salary, utilities, supplies...
  description  TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  receipt_url  TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cash_flow (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         VARCHAR(10) NOT NULL CHECK (type IN ('in','out')),
  amount       NUMERIC(10,2) NOT NULL,
  description  TEXT,
  recorded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- STAFF SHIFTS & PAYROLL
-- ============================================================

CREATE TABLE shifts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
  scheduled_start_time TIMESTAMP,
  status               VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
  clock_in             TIMESTAMP NOT NULL,
  clock_out            TIMESTAMP,
  hourly_rate          NUMERIC(10,2) DEFAULT 0,
  created_at           TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TAX SETTINGS
-- ============================================================

CREATE TABLE tax_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  rate        NUMERIC(5,2) NOT NULL,  -- e.g. 12.00 for 12%
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(200) NOT NULL,
  table_name  VARCHAR(100),
  record_id   UUID,
  details     JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  type       VARCHAR(50),  -- order_ready, low_stock, etc.
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
