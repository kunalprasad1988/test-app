const express = require('express');
const ExcelJS = require('exceljs');
const { prepare, decrypt } = require('./db');
const { authMiddleware, adminOnly } = require('./auth');

const router = express.Router();

router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  next();
});

router.get('/tests/:id/export', authMiddleware, adminOnly, async (req, res) => {
  const test = prepare('SELECT * FROM tests WHERE id = ?').get(+req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  const sessions = prepare('SELECT s.*, u.username, u.full_name, u.team_name, u.login_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.test_id = ? AND s.is_submitted = 1').all(+req.params.id);
  const questions = prepare('SELECT * FROM questions WHERE test_id = ?').all(+req.params.id);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Results');
  const headers = ['Name', 'Login ID', 'Employee ID', 'Team', 'Score', 'Total', 'Percentage', 'Submitted At', 'Violations'];
  questions.forEach((q, i) => headers.push('Q' + (i + 1)));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  for (const s of sessions) {
    const violations = prepare('SELECT COUNT(*) as c FROM violations WHERE session_id = ?').get(s.id).c;
    const answers = s.answers_encrypted ? JSON.parse(decrypt(s.answers_encrypted)) : {};
    const row = [s.full_name || s.username, s.login_id || '', s.username, s.team_name || '', s.score, s.total_marks, s.total_marks ? Math.round(s.score / s.total_marks * 100) + '%' : '0%', s.submitted_at, violations];
    questions.forEach(q => row.push(answers[q.id] || ''));
    ws.addRow(row);
  }

  const vs = wb.addWorksheet('Violations');
  vs.addRow(['Name', 'Employee ID', 'Type', 'Details', 'Timestamp']);
  vs.getRow(1).font = { bold: true };
  const allV = prepare('SELECT v.*, u.username, u.full_name FROM violations v JOIN users u ON v.user_id = u.id WHERE v.test_id = ? ORDER BY v.timestamp').all(+req.params.id);
  for (const v of allV) { vs.addRow([v.full_name || v.username, v.username, v.type, v.details, v.timestamp]); }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${test.title}_results.xlsx"`);
  await wb.xlsx.write(res);
});

router.get('/tests/:id/violations/export', authMiddleware, adminOnly, async (req, res) => {
  const test = prepare('SELECT * FROM tests WHERE id = ?').get(+req.params.id);
  const violations = prepare('SELECT v.*, u.username, u.full_name FROM violations v JOIN users u ON v.user_id = u.id WHERE v.test_id = ? ORDER BY u.username, v.timestamp').all(+req.params.id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Violation Report');
  ws.addRow(['Name', 'Employee ID', 'Violation Type', 'Details', 'Timestamp']);
  ws.getRow(1).font = { bold: true };
  for (const v of violations) { ws.addRow([v.full_name || v.username, v.username, v.type, v.details, v.timestamp]); }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${test.title}_violations.xlsx"`);
  await wb.xlsx.write(res);
});

module.exports = router;
