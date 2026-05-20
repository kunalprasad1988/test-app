const express = require('express');
const { prepare, encrypt, decrypt } = require('./db');
const { authMiddleware } = require('./auth');
const { logAudit } = require('./audit');

const router = express.Router();

router.post('/tests/:id/start', authMiddleware, async (req, res) => {
  if (req.user.role !== 'candidate') return res.status(403).json({ error: 'Candidates only' });
  const test = await prepare('SELECT * FROM tests WHERE id = ? AND is_published = 1').get(+req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found or not published' });

  const existing = await prepare('SELECT * FROM sessions WHERE user_id = ? AND test_id = ? AND is_submitted = 0').get(req.user.id, test.id);
  if (existing) {
    const questions = await prepare('SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE test_id = ?').all(test.id);
    const order = JSON.parse(existing.question_order);
    const ordered = order.map(id => questions.find(q => q.id === id)).filter(Boolean);
    const savedAnswers = existing.answers_encrypted ? JSON.parse(decrypt(existing.answers_encrypted)) : {};
    return res.json({ session_id: existing.id, test, questions: ordered, answers: savedAnswers, started_at: existing.started_at });
  }

  let questions = await prepare('SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE test_id = ?').all(test.id);
  let order = questions.map(q => q.id);
  if (test.randomize_questions) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const result = await prepare('INSERT INTO sessions (user_id, test_id, question_order) VALUES (?, ?, ?)').run(req.user.id, test.id, JSON.stringify(order));
  const ordered = order.map(id => questions.find(q => q.id === id));
  await logAudit(req.user.id, 'START_TEST', `Started test ${test.id}`, req.ip);
  res.json({ session_id: result.lastInsertRowid, test, questions: ordered, answers: {}, started_at: new Date().toISOString() });
});

router.post('/sessions/:id/save', authMiddleware, async (req, res) => {
  const session = await prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(+req.params.id, req.user.id);
  if (!session || session.is_submitted) return res.status(400).json({ error: 'Invalid session' });
  const encrypted = encrypt(JSON.stringify(req.body.answers));
  await prepare('UPDATE sessions SET answers_encrypted = ? WHERE id = ?').run(encrypted, session.id);
  res.json({ message: 'Saved' });
});

router.post('/sessions/:id/submit', authMiddleware, async (req, res) => {
  const session = await prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(+req.params.id, req.user.id);
  if (!session || session.is_submitted) return res.status(400).json({ error: 'Already submitted or invalid' });
  const answers = req.body.answers || {};
  const encrypted = encrypt(JSON.stringify(answers));
  const questions = await prepare('SELECT id, correct_answer, marks FROM questions WHERE test_id = ?').all(session.test_id);
  let score = 0, total = 0;
  for (const q of questions) {
    total += q.marks;
    if (answers[q.id] && answers[q.id].toLowerCase() === (q.correct_answer || '').toLowerCase()) score += q.marks;
  }
  await prepare('UPDATE sessions SET is_submitted = 1, submitted_at = NOW(), answers_encrypted = ?, score = ?, total_marks = ? WHERE id = ?').run(encrypted, score, total, session.id);
  await logAudit(req.user.id, 'SUBMIT_TEST', `Submitted test ${session.test_id}, score: ${score}/${total}`, req.ip);
  res.json({ message: 'Submitted', score, total });
});

router.post('/sessions/:id/violation', authMiddleware, async (req, res) => {
  const session = await prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(+req.params.id, req.user.id);
  if (!session || session.is_submitted) return res.status(400).json({ error: 'Invalid' });
  const { type, details } = req.body;
  await prepare('INSERT INTO violations (session_id, user_id, test_id, type, details) VALUES (?, ?, ?, ?, ?)').run(session.id, req.user.id, session.test_id, type, details);
  const count = +(await prepare('SELECT COUNT(*) as c FROM violations WHERE session_id = ?').get(session.id)).c;
  const test = await prepare('SELECT max_violations FROM tests WHERE id = ?').get(session.test_id);

  if (count >= test.max_violations) {
    const savedAnswers = session.answers_encrypted ? JSON.parse(decrypt(session.answers_encrypted)) : {};
    const questions = await prepare('SELECT id, correct_answer, marks FROM questions WHERE test_id = ?').all(session.test_id);
    let score = 0, total = 0;
    for (const q of questions) { total += q.marks; if (savedAnswers[q.id] && savedAnswers[q.id].toLowerCase() === (q.correct_answer || '').toLowerCase()) score += q.marks; }
    await prepare('UPDATE sessions SET is_submitted = 1, submitted_at = NOW(), score = ?, total_marks = ? WHERE id = ?').run(score, total, session.id);
    await logAudit(req.user.id, 'AUTO_SUBMIT', `Auto-submitted test ${session.test_id} due to ${count} violations`, req.ip);
    return res.json({ auto_submitted: true, violation_count: count, message: 'Test auto-submitted due to violations' });
  }
  res.json({ violation_count: count, max: test.max_violations });
});

router.get('/my-results', authMiddleware, async (req, res) => {
  const results = await prepare('SELECT s.id, s.test_id, t.title, s.score, s.total_marks, s.submitted_at FROM sessions s JOIN tests t ON s.test_id = t.id WHERE s.user_id = ? AND s.is_submitted = 1').all(req.user.id);
  for (const r of results) {
    r.violations = +(await prepare('SELECT COUNT(*) as c FROM violations WHERE session_id = ?').get(r.id)).c;
  }
  res.json(results);
});

router.get('/tests', authMiddleware, async (req, res) => {
  res.json(await prepare('SELECT id, title, description, duration_minutes FROM tests WHERE is_published = 1').all());
});

module.exports = router;
