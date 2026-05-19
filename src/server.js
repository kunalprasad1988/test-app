const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

async function start() {
  await initDb();

  // Seed after DB init
  require('./seed');

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/auth', require('./routes-auth'));
  app.use('/api/admin', require('./routes-admin'));
  app.use('/api/candidate', require('./routes-candidate'));
  app.use('/api/export', require('./routes-export'));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Test app running at http://localhost:${PORT}`));
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
