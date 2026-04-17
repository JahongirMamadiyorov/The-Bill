const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/inventory
router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, unit,
             quantity_in_stock AS quantity,
             low_stock_alert   AS min_quantity,
             cost_per_unit,
             created_at, updated_at
      FROM warehouse_items ORDER BY name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/inventory/low-stock
router.get('/low-stock', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, unit,
             quantity_in_stock AS quantity,
             low_stock_alert   AS min_quantity,
             cost_per_unit
      FROM warehouse_items
      WHERE quantity_in_stock <= low_stock_alert
      ORDER BY quantity_in_stock ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inventory
router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  // accept both field name styles
  const name          = req.body.name;
  const unit          = req.body.unit;
  const qty           = req.body.quantity          ?? req.body.quantity_in_stock ?? 0;
  const minQty        = req.body.min_quantity       ?? req.body.low_stock_alert   ?? 0;
  const costPerUnit   = req.body.cost_per_unit      ?? 0;
  try {
    const result = await db.query(
      'INSERT INTO warehouse_items (name,unit,quantity_in_stock,low_stock_alert,cost_per_unit) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, unit, qty, minQty, costPerUnit]
    );
    const row = result.rows[0];
    res.status(201).json({ ...row, quantity: row.quantity_in_stock, min_quantity: row.low_stock_alert });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/inventory/:id
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const name        = req.body.name;
  const unit        = req.body.unit;
  const qty         = req.body.quantity     ?? req.body.quantity_in_stock ?? 0;
  const minQty      = req.body.min_quantity  ?? req.body.low_stock_alert   ?? 0;
  const costPerUnit = req.body.cost_per_unit ?? 0;
  try {
    const result = await db.query(
      `UPDATE warehouse_items
       SET name=$1, unit=$2, quantity_in_stock=$3, low_stock_alert=$4, cost_per_unit=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, unit, qty, minQty, costPerUnit, req.params.id]
    );
    const row = result.rows[0];
    res.json({ ...row, quantity: row.quantity_in_stock, min_quantity: row.low_stock_alert });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM warehouse_items WHERE id=$1', [req.params.id]);
    res.json({ message: 'Ingredient deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inventory/:id/waste   ← frontend calls this URL
router.post('/:id/waste', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { quantity, reason } = req.body;
  try {
    await db.query(
      'UPDATE warehouse_items SET quantity_in_stock = GREATEST(0, quantity_in_stock - $1), updated_at=NOW() WHERE id=$2',
      [quantity, req.params.id]
    );
    await db.query(
      `INSERT INTO expenses (category, description, amount, expense_date, recorded_by)
       VALUES ('waste', $1, 0, CURRENT_DATE, $2)`,
      [reason || 'Stock waste/spoilage', req.user.id]
    );
    res.json({ message: 'Waste recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// keep old URL too for compatibility
router.post('/record-waste', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { ingredient_id, quantity, reason } = req.body;
  try {
    await db.query(
      'UPDATE warehouse_items SET quantity_in_stock = GREATEST(0, quantity_in_stock - $1), updated_at=NOW() WHERE id=$2',
      [quantity, ingredient_id]
    );
    res.json({ message: 'Waste recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
