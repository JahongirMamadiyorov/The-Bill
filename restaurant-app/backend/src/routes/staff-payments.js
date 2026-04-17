const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/staff-payments/mine  — any authenticated user sees their own payments
router.get('/mine', authenticate, async (req, res) => {
  const { from, to } = req.query;
  try {
    let query = `SELECT * FROM staff_payments WHERE user_id=$1`;
    const params = [req.user.id];
    if (from) { params.push(from); query += ` AND payment_date >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND payment_date <= $${params.length}`; }
    query += ' ORDER BY payment_date DESC, created_at DESC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /staff-payments/mine error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff-payments/latest
// Returns the single most-recent payment per user (used to compute per-employee period start)
router.get('/latest', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT ON (user_id)
        user_id,
        payment_date,
        amount,
        note
      FROM staff_payments
      ORDER BY user_id, payment_date DESC, created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /staff-payments/latest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff-payments?user_id=&from=&to=
router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { user_id, from, to } = req.query;
  try {
    let query = `
      SELECT sp.*, u.name as staff_name
      FROM staff_payments sp
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (user_id) { params.push(user_id); query += ` AND sp.user_id=$${params.length}`; }
    if (from)    { params.push(from);    query += ` AND sp.payment_date >= $${params.length}`; }
    if (to)      { params.push(to);      query += ` AND sp.payment_date <= $${params.length}`; }
    query += ' ORDER BY sp.payment_date DESC, sp.created_at DESC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /staff-payments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff-payments
router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { user_id, amount, payment_method, payment_date, note } = req.body;
  if (!user_id || amount == null) return res.status(400).json({ error: 'Missing user_id or amount' });

  const validMethods = ['cash', 'bank_transfer', 'check', 'other'];
  const method = validMethods.includes(payment_method) ? payment_method : 'cash';

  try {
    const result = await db.query(
      `INSERT INTO staff_payments (user_id, amount, payment_method, payment_date, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, amount, method, payment_date || new Date().toISOString().split('T')[0], note || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /staff-payments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/staff-payments/:id
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, payment_date, note } = req.body;
  try {
    const cur = await db.query('SELECT * FROM staff_payments WHERE id=$1', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Payment not found' });

    const c = cur.rows[0];
    const validMethods = ['cash', 'bank_transfer', 'check', 'other'];
    const newMethod = validMethods.includes(payment_method) ? payment_method : c.payment_method;

    const result = await db.query(
      `UPDATE staff_payments
       SET amount=$1, payment_method=$2, payment_date=$3, note=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [
        amount        !== undefined ? amount        : c.amount,
        newMethod,
        payment_date  !== undefined ? payment_date  : c.payment_date,
        note          !== undefined ? note          : c.note,
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /staff-payments/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff-payments/:id
router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM staff_payments WHERE id=$1 RETURNING id', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Payment not found' });
    res.json({ message: 'Payment deleted', id: result.rows[0].id });
  } catch (err) {
    console.error('DELETE /staff-payments/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
