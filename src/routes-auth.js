const express = require('express');
const bcrypt = require('bcryptjs');
const { prepare } = require('./db');
const { generateToken } = require('./auth');
const { logAudit } = require('./audit');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken(user);
  await logAudit(user.id, 'LOGIN', 'Admin logged in', req.ip);
  res.cookie('token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

router.post('/candidate-login', async (req, res) => {
  const { full_name, login_id, employee_id, team_name } = req.body;
  if (!full_name || !login_id || !employee_id || !team_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  let user = await prepare('SELECT * FROM users WHERE username = ?').get(employee_id);
  if (!user) {
    const hash = bcrypt.hashSync(employee_id + '-auto', 10);
    await prepare('INSERT INTO users (username, password, full_name, role, team_name, login_id) VALUES (?, ?, ?, ?, ?, ?)').run(employee_id, hash, full_name, 'candidate', team_name, login_id);
    user = await prepare('SELECT * FROM users WHERE username = ?').get(employee_id);
    await logAudit(user.id, 'SELF_REGISTER', `${full_name} (${login_id}/${employee_id}) from ${team_name}`, req.ip);
  }
  const token = generateToken(user);
  await logAudit(user.id, 'LOGIN', `Candidate login: ${full_name}`, req.ip);
  res.cookie('token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, team_name: user.team_name, login_id: user.login_id } });
});

module.exports = router;
