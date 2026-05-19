const bcrypt = require('bcryptjs');
const { initDb, prepare } = require('./db');

async function seed() {
  await initDb();
  const admin = prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    prepare('INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)').run('admin', adminPass, 'admin', 'Administrator');
    console.log('Seed complete. Admin: admin / admin123');
  } else {
    console.log('Database already seeded.');
  }
}

// Run if called directly
if (require.main === module) {
  seed().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
