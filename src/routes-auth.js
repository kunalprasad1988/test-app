const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { generateToken } = require('./auth');
const { logAudit } = require('./audit');

const router = express.Router();

// Admin login (password-based)
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken(user);
  logAudit(user.id, 'LOGIN', 'Admin logged in', req.ip);
  res.cookie('token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

// Candidate self-registration (no password needed)
router.post('/candidate-login', (req, res) => {
  const { full_name, employee_id, team_name } = req.body;
  if (!full_name || !employee_id || !team_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Check if this employee_id already exists
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(employee_id);
  if (!user) {
    // Auto-create candidate account (no password needed)
    const hash = bcrypt.hashSync(employee_id + '-auto', 10);
    const result = db.prepare('INSERT INTO users (username, password, full_name, role, team_name) VALUES (?, ?, ?, ?, ?)').run(employee_id, hash, full_name, 'candidate', team_name);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    logAudit(user.id, 'SELF_REGISTER', `${full_name} (${employee_id}) from ${team_name}`, req.ip);
  }

  const token = generateToken(user);
  logAudit(user.id, 'LOGIN', `Candidate login: ${full_name}`, req.ip);
  res.cookie('token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, team_name: user.team_name } });
});

module.exports = router;
