const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(schema);
    console.log('✅ Schema applied successfully');
  } catch (err) {
    console.error('Migration note:', err.message);
  }

  try {
    // Seed tax_settings if empty
    const tax = await pool.query('SELECT COUNT(*) FROM tax_settings');
    if (parseInt(tax.rows[0].count) === 0) {
      await pool.query(
        "INSERT INTO tax_settings (name, rate, is_active) VALUES ('VAT', 0, true)"
      );
      console.log('✅ Default tax settings seeded');
    }
  } catch (e) {
    console.log('Seed skip:', e.message);
  }

  try {
    const dbReset = fs.readFileSync(path.join(__dirname, 'migrate_v6_orders.sql'), 'utf8');
    await pool.query(dbReset);
    console.log('✅ Migration v6 (orders) applied');
  } catch (e) { console.log('v6 skip:', e.message); }

  try {
    const v7 = fs.readFileSync(path.join(__dirname, 'migrate_v7_kitchen.sql'), 'utf8');
    await pool.query(v7);
    console.log('✅ Migration v7 (kitchen stations) applied');
  } catch (e) { console.log('v7 skip:', e.message); }

  try {
    const v8 = fs.readFileSync(path.join(__dirname, 'migrate_v8_finance.sql'), 'utf8');
    await pool.query(v8);
    console.log('✅ Migration v8 (finance module) applied');
  } catch (e) { console.log('v8 skip:', e.message); }

  try {
    const v9 = fs.readFileSync(path.join(__dirname, 'migrate_v9_sections.sql'), 'utf8');
    await pool.query(v9);
    console.log('✅ Migration v9 (table sections) applied');
  } catch (e) { console.log('v9 skip:', e.message); }

  await pool.end();
}

migrate();
