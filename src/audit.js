const { db } = require('./db');

function logAudit(userId, action, details, ip) {
  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(userId, action, details, ip);
}

module.exports = { logAudit };
