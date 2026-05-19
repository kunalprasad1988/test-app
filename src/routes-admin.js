const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { prepare } = require('./db');
const { authMiddleware, adminOnly } = require('./auth');
const { logAudit } = require('./audit');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

router.post('/tests', authMiddleware, adminOnly, (req, res) => {
  const { title, description, duration_minutes, max_violations, randomize_questions } = req.body;
  const result = prepare('INSERT INTO tests (title, description, duration_minutes, max_violations, randomize_questions, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title, description, duration_minutes || 60, max_violations || 5, randomize_questions !== false ? 1 : 0, req.user.id);
  logAudit(req.user.id, 'CREATE_TEST', `Test "${title}" created`, req.ip);
  res.json({ id: result.lastInsertRowid, message: 'Test created' });
});

router.get('/tests', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    res.json(prepare('SELECT * FROM tests ORDER BY created_at DESC').all());
  } else {
    res.json(prepare('SELECT id, title, description, duration_minutes FROM tests WHERE is_published = 1').all());
  }
});

router.patch('/tests/:id/publish', authMiddleware, adminOnly, (req, res) => {
  const { is_published } = req.body;
  prepare('UPDATE tests SET is_published = ? WHERE id = ?').run(is_published ? 1 : 0, +req.params.id);
  logAudit(req.user.id, 'PUBLISH_TEST', `Test ${req.params.id} ${is_published ? 'published' : 'unpublished'}`, req.ip);
  res.json({ message: 'Updated' });
});

router.post('/tests/:id/questions/upload', authMiddleware, adminOnly, upload.single('file'), (req, res) => {
  const testId = +req.params.id;
  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  let questions = [];
  try {
    if (ext === '.json') {
      questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else if (['.csv', '.xlsx', '.xls'].includes(ext)) {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      questions = XLSX.utils.sheet_to_json(sheet);
    } else {
      return res.status(400).json({ error: 'Unsupported format. Use CSV, XLSX, or JSON.' });
    }
    for (const q of questions) {
      prepare('INSERT INTO questions (test_id, question_text, option_a, option_b, option_c, option_d, correct_answer, marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(testId, q.question || q.question_text, q.option_a || q.a, q.option_b || q.b, q.option_c || q.c, q.option_d || q.d, q.correct_answer || q.answer, q.marks || 1);
    }
    logAudit(req.user.id, 'UPLOAD_QUESTIONS', `${questions.length} questions uploaded to test ${testId}`, req.ip);
    res.json({ message: `${questions.length} questions uploaded` });
  } catch (e) {
    res.status(400).json({ error: 'Failed to parse file: ' + e.message });
  } finally {
    fs.unlinkSync(filePath);
  }
});

router.get('/tests/:id/questions', authMiddleware, (req, res) => {
  const questions = prepare('SELECT * FROM questions WHERE test_id = ?').all(+req.params.id);
  if (req.user.role !== 'admin') {
    questions.forEach(q => delete q.correct_answer);
  }
  res.json(questions);
});

router.delete('/tests/:id', authMiddleware, adminOnly, (req, res) => {
  prepare('DELETE FROM questions WHERE test_id = ?').run(+req.params.id);
  prepare('DELETE FROM tests WHERE id = ?').run(+req.params.id);
  logAudit(req.user.id, 'DELETE_TEST', `Test ${req.params.id} deleted`, req.ip);
  res.json({ message: 'Deleted' });
});

router.get('/dashboard', authMiddleware, adminOnly, (req, res) => {
  const tests = prepare('SELECT COUNT(*) as count FROM tests').get().count;
  const candidates = prepare("SELECT COUNT(*) as count FROM users WHERE role='candidate'").get().count;
  const submissions = prepare('SELECT COUNT(*) as count FROM sessions WHERE is_submitted=1').get().count;
  const violations = prepare('SELECT COUNT(*) as count FROM violations').get().count;
  res.json({ tests, candidates, submissions, violations });
});

router.get('/tests/:id/sessions', authMiddleware, adminOnly, (req, res) => {
  const sessions = prepare(`
    SELECT s.*, u.username, u.full_name FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.test_id = ? AND s.is_submitted = 1
    ORDER BY s.submitted_at DESC
  `).all(+req.params.id);
  // Add violation count
  sessions.forEach(s => {
    s.violation_count = prepare('SELECT COUNT(*) as c FROM violations WHERE session_id = ?').get(s.id).c;
  });
  res.json(sessions);
});

router.get('/audit-logs', authMiddleware, adminOnly, (req, res) => {
  const logs = prepare('SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.timestamp DESC LIMIT 200').all();
  res.json(logs);
});

module.exports = router;
