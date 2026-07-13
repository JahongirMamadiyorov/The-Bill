'use strict';

// Client-side (local SQLite) schema for the PowerSync-managed database.
// Column types are only ever 'text', 'integer', or 'real' — PowerSync casts automatically
// if a value doesn't match. Every Table gets an `id` column of type text for free; don't
// declare it yourself. Booleans from Postgres come through as integer (0/1).
//
// This mirrors the Sync Streams config deployed in the PowerSync Dashboard for the
// "the-bill-pos" project — if a column is added/removed there, mirror the change here too.
// `users.password_hash` / `pin_hash` are deliberately excluded from both — never replicate
// credential hashes down to shared POS terminals.
//
// NOTE: @powersync/node is a pure ESM package (no `require` support), so `column`/`Schema`/
// `Table` can't be imported at the top of this CommonJS file. main.js loads them via dynamic
// `import()` and passes them into buildSchema() below.

function buildSchema({ column, Schema, Table }) {
  const restaurants = new Table({
    name:             column.text,
    slug:             column.text,
    address:          column.text,
    phone:            column.text,
    logo_url:         column.text,
    is_active:        column.integer,
    plan:             column.text,
    plan_started_at:  column.text,
    plan_expires_at:  column.text,
    plan_price:       column.real,
    plan_total:       column.real,
    created_at:       column.text,
    updated_at:       column.text,
  });

  const users = new Table({
    restaurant_id:    column.text,
    name:             column.text,
    email:            column.text,
    phone:            column.text,
    role:             column.text,
    is_active:        column.integer,
    salary:           column.real,
    salary_type:      column.text,
    shift_start:      column.text,
    shift_end:        column.text,
    kitchen_station:  column.text,
    commission_rate:  column.real,
    created_at:       column.text,
    updated_at:       column.text,
  });

  const restaurant_tables = new Table({
    restaurant_id:      column.text,
    table_number:       column.integer,
    name:               column.text,
    capacity:           column.integer,
    status:             column.text,
    section:            column.text,
    shape:              column.text,
    assigned_to:        column.text,
    opened_at:          column.text,
    guests_count:       column.integer,
    reservation_guest:  column.text,
    reservation_phone:  column.text,
    reservation_date:   column.text,
    reservation_time:   column.text,
    created_at:         column.text,
  });

  const table_sections = new Table({
    restaurant_id: column.text,
    name:          column.text,
  });

  const categories = new Table({
    restaurant_id: column.text,
    name:          column.text,
    sort_order:    column.integer,
    created_at:    column.text,
  });

  const menu_items = new Table({
    restaurant_id:    column.text,
    category_id:      column.text,
    name:             column.text,
    description:      column.text,
    price:            column.real,
    image_url:        column.text,
    is_available:     column.integer,
    item_type:        column.text,
    kitchen_station:  column.text,
    sort_order:       column.integer,
    created_at:       column.text,
    updated_at:       column.text,
    unit:             column.text,
  });

  // Synthetic id (menu_item_id:ingredient_id) — this table has no natural single-column PK.
  const menu_item_ingredients = new Table({
    menu_item_id:   column.text,
    ingredient_id:  column.text,
    quantity_used:  column.real,
  });

  const custom_stations = new Table({
    restaurant_id: column.text,
    name:          column.text,
  });

  const orders = new Table({
    restaurant_id:         column.text,
    table_id:              column.text,
    waitress_id:           column.text,
    status:                column.text,
    notes:                 column.text,
    order_type:            column.text,
    guest_count:           column.integer,
    customer_name:         column.text,
    customer_phone:        column.text,
    delivery_address:      column.text,
    delivery_status:       column.text,
    daily_number:          column.integer,
    discount_amount:       column.real,
    tax_amount:            column.real,
    total_amount:          column.real,
    payment_method:        column.text,
    paid_at:               column.text,
    paid_by:               column.text,
    split_payments:        column.text, // jsonb -> JSON string; JSON.parse() in app code
    cancellation_reason:   column.text,
    created_at:            column.text,
    updated_at:            column.text,
  }, { indexes: { by_restaurant: ['restaurant_id'], by_table: ['table_id'] } });

  const order_items = new Table({
    order_id:      column.text,
    menu_item_id:  column.text,
    quantity:      column.real,
    unit_price:    column.real,
    custom_price:  column.real,
    is_free:       column.integer,
    notes:         column.text,
    status:        column.text,
    item_ready:    column.integer,
    served_at:     column.text,
    created_at:    column.text,
  }, { indexes: { by_order: ['order_id'] } });

  const customers = new Table({
    restaurant_id:  column.text,
    name:           column.text,
    phone:          column.text,
    email:          column.text,
    loyalty_pts:    column.integer,
    visit_count:    column.integer,
    created_at:     column.text,
  });

  const notifications = new Table({
    restaurant_id:  column.text,
    user_id:        column.text,
    title:          column.text,
    body:           column.text,
    type:           column.text,
    is_read:        column.integer,
    created_at:     column.text,
  });

  const waitress_permissions = new Table({
    user_id:                     column.text,
    restaurant_id:               column.text,
    can_create_orders:           column.integer,
    can_modify_orders:           column.integer,
    can_cancel_orders:           column.integer,
    can_delete_order_items:      column.integer,
    can_add_free_items:          column.integer,
    can_apply_discounts:         column.integer,
    can_set_custom_price:        column.integer,
    can_process_payments:        column.integer,
    can_split_bills:             column.integer,
    can_issue_refunds:           column.integer,
    can_open_close_table:        column.integer,
    can_transfer_table:          column.integer,
    can_merge_tables:            column.integer,
    can_see_other_tables:        column.integer,
    can_see_sales_numbers:       column.integer,
    can_see_customer_history:    column.integer,
    updated_at:                  column.text,
  });

  // Only the subset of restaurant_settings actually selected in the Sync Streams config —
  // not the full backend table. Add columns here AND in the Sync Streams query together.
  const restaurant_settings = new Table({
    restaurant_id:            column.text,
    restaurant_name:          column.text,
    receipt_header:           column.text,
    service_charge_rate:      column.real,
    service_charge_enabled:   column.integer,
    address:                  column.text,
    phone:                    column.text,
    logo_url:                 column.text,
    currency_symbol:          column.text,
    receipt_footer:           column.text,
    printer_ip:               column.text,
    printer_port:             column.integer,
    kitchen_printer_ip:       column.text,
    kitchen_printer_port:     column.integer,
    tax_rate:                 column.real,
    tax_enabled:              column.integer,
    kitchen_printers:         column.text, // jsonb -> JSON string
    receipt_printers:         column.text, // jsonb -> JSON string
  });

  return new Schema({
    restaurants,
    users,
    restaurant_tables,
    table_sections,
    categories,
    menu_items,
    menu_item_ingredients,
    custom_stations,
    orders,
    order_items,
    customers,
    notifications,
    waitress_permissions,
    restaurant_settings,
  });
}

module.exports = { buildSchema };
