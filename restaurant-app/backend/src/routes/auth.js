const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// POST /api/auth/login
// Accepts { identifier, password } where identifier can be:
//   • an email    — contains @  → matched against email column
//   • a phone     — digits / starts with +  → normalised to +XXXXXXXXXX, matched against phone column
//   • a username  — anything else → matched against name column (case-insensitive)
// Also accepts legacy { email, password } for backward compatibility.
router.post('/login', async (req, res) => {
  const { identifier, email: legacyEmail, password } = req.body;
  const id = (identifier || legacyEmail || '').trim();

  if (!id || !password)
    return res.status(400).json({ error: 'Identifier and password required' });

  try {
    let result;

    // NOTE: we use "is_active IS NOT FALSE" instead of "is_active=true" so that
    // accounts where the column is NULL (old rows, manual inserts) are also
    // allowed to log in.  Only explicitly suspended accounts (is_active=false)
    // are blocked.
    if (id.includes('@')) {
      // ── Email ────────────────────────────────────────────────────
      result = await db.query(
        'SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND is_active IS NOT FALSE',
        [id]
      );
    } else if (/^\+?\d[\d\s\-()+]*$/.test(id)) {
      // ── Phone ────────────────────────────────────────────────────
      // Strip ALL non-digit characters from BOTH the input and the stored
      // phone column so that "+998901234567", "+998 90 123 45 67" and
      // "998901234567" all match each other regardless of how the admin
      // originally typed the number when creating the account.
      const digitsOnly = id.replace(/\D/g, '');
      result = await db.query(
        "SELECT * FROM users WHERE REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = $1 AND is_active IS NOT FALSE",
        [digitsOnly]
      );
    } else {
      // ── Username / name / short email (no @) ─────────────────────
      result = await db.query(
        'SELECT * FROM users WHERE (LOWER(name)=LOWER($1) OR LOWER(email)=LOWER($1)) AND is_active IS NOT FALSE',
        [id]
      );
    }

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Account not found. Check your phone, email or username.', code: 'NOT_FOUND' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Wrong password. Please try again.', code: 'WRONG_PASSWORD' });

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, kitchen_station: user.kitchen_station || null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        role: user.role, kitchen_station: user.kitchen_station || null,
        created_at: user.created_at || null,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register (owner only in prod — use for initial setup)
router.post('/register', async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'name, email, password, role required' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role',
      [name, email, phone, hash, role]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
