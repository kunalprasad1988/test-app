const bcrypt = require('bcryptjs');
const { prepare } = require('./db');

// Only seed if admin doesn't exist
const admin = prepare('SELECT * FROM users WHERE username = ?').get('admin');
if (!admin) {
  const adminPass = bcrypt.hashSync('admin123', 10);
  prepare('INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)').run('admin', adminPass, 'admin', 'Administrator');
  console.log('Seed complete. Admin: admin / admin123');
} else {
  console.log('Database already seeded.');
}
