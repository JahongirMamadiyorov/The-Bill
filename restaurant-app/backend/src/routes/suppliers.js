const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// Auto-migrate: add new columns if missing
(async () => {
  await db.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name TEXT DEFAULT ''`).catch(() => {});
  await db.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT ''`).catch(() => {});
  await db.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category TEXT DEFAULT ''`).catch(() => {});
})();

router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const result = await db.query('SELECT * FROM suppliers ORDER BY name');
  res.json(result.rows);
});

router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { name, phone, email, address, contact_name, payment_terms, category } = req.body;
  const result = await db.query(
    'INSERT INTO suppliers (name,phone,email,address,contact_name,payment_terms,category) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, phone, email, address, contact_name || '', payment_terms || '', category || '']
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { name, phone, email, address, contact_name, payment_terms, category } = req.body;
  const result = await db.query(
    'UPDATE suppliers SET name=$1,phone=$2,email=$3,address=$4,contact_name=$5,payment_terms=$6,category=$7 WHERE id=$8 RETURNING *',
    [name, phone, email, address, contact_name || '', payment_terms || '', category || '', req.params.id]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  await db.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
  res.json({ message: 'Supplier deleted' });
});

// Purchase Orders
router.get('/purchase-orders', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const result = await db.query(
    `SELECT po.*, s.name as supplier_name, u.name as created_by_name
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id=s.id
     LEFT JOIN users u ON po.created_by=u.id
     ORDER BY po.ordered_at DESC`
  );
  res.json(result.rows);
});

router.post('/purchase-orders', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { supplier_id, items, notes } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    for (const item of items) total += item.quantity * item.unit_cost;
    const po = await client.query(
      'INSERT INTO purchase_orders (supplier_id,created_by,total_cost,notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [supplier_id, req.user.id, total, notes]
    );
    for (const item of items) {
      await client.query(
        'INSERT INTO purchase_order_items (purchase_order_id,ingredient_id,quantity,unit_cost) VALUES ($1,$2,$3,$4)',
        [po.rows[0].id, item.ingredient_id, item.quantity, item.unit_cost]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(po.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Mark purchase order as received — updates inventory
router.put('/purchase-orders/:id/receive', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const items = await client.query(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id=$1', [req.params.id]
    );
    for (const item of items.rows) {
      await client.query(
        'UPDATE warehouse_items SET quantity_in_stock = quantity_in_stock + $1 WHERE id=$2',
        [item.quantity, item.ingredient_id]
      );
    }
    await client.query(
      `UPDATE purchase_orders SET status='received', received_at=NOW() WHERE id=$1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Purchase order received, stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
