const { prepare } = require('./db');

async function logAudit(userId, action, details, ip) {
  await prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(userId, action, details, ip);
}

module.exports = { logAudit };
