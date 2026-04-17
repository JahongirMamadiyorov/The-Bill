const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications — user's own notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.json([]); // table may not exist yet — return empty gracefully
  }
});

// PUT /api/notifications/read-all  (must come BEFORE /:id/read)
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'All marked as read' });
  } catch (err) { res.json({ message: 'ok' }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.json({ message: 'ok' }); }
});

// DELETE /api/notifications/old — purge notifications older than 5 days for this user
router.delete('/old', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM notifications WHERE user_id=$1 AND created_at < NOW() - INTERVAL '5 days'`,
      [req.user.id]
    );
    res.json({ deleted: result.rowCount });
  } catch (err) { res.json({ deleted: 0 }); }
});

// POST /api/notifications — send notification (admin/owner)
router.post('/', authenticate, async (req, res) => {
  try {
    const { user_id, title, body, type } = req.body;
    const result = await db.query(
      'INSERT INTO notifications (user_id,title,body,type) VALUES ($1,$2,$3,$4) RETURNING *',
      [user_id, title, body, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
