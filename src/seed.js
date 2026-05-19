const bcrypt = require('bcryptjs');
const { db } = require('./db');

// Create default admin
const adminPass = bcrypt.hashSync('admin123', 10);
const candidatePass = bcrypt.hashSync('test123', 10);

db.prepare(`INSERT OR IGNORE INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)`).run('admin', adminPass, 'admin', 'Administrator');
db.prepare(`INSERT OR IGNORE INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)`).run('candidate1', candidatePass, 'candidate', 'Test Candidate 1');
db.prepare(`INSERT OR IGNORE INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)`).run('candidate2', candidatePass, 'candidate', 'Test Candidate 2');

console.log('Seed complete. Default users:');
console.log('  Admin: admin / admin123');
console.log('  Candidate: candidate1 / test123');
console.log('  Candidate: candidate2 / test123');
