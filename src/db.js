const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data.db');
const ENCRYPTION_KEY = crypto.scryptSync('test-app-secret-key-change-in-prod', 'salt', 32);

let db = null;
let initialized = false;

async function initDb() {
  if (initialized) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      full_name TEXT,
      team_name TEXT,
      login_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      max_violations INTEGER NOT NULL DEFAULT 5,
      is_published INTEGER DEFAULT 0,
      randomize_questions INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER,
      question_text TEXT NOT NULL,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_answer TEXT,
      marks INTEGER DEFAULT 1
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      test_id INTEGER,
      started_at TEXT DEFAULT (datetime('now')),
      submitted_at TEXT,
      is_submitted INTEGER DEFAULT 0,
      score INTEGER,
      total_marks INTEGER,
      answers_encrypted TEXT,
      question_order TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      user_id INTEGER,
      test_id INTEGER,
      type TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      details TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);
  saveDb();
  initialized = true;
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function prepare(sql) {
  return {
    run(...params) {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) {
          const cleaned = params.map(p => p === undefined ? null : p);
          stmt.bind(cleaned);
        }
        stmt.step();
      } finally {
        stmt.free();
      }
      // Get last insert rowid using db.exec
      let lastId = 0;
      try {
        const rows = db.exec("SELECT last_insert_rowid()");
        if (rows.length > 0 && rows[0].values.length > 0) {
          lastId = rows[0].values[0][0];
        }
      } catch(e) {}
      saveDb();
      return { lastInsertRowid: lastId };
    },
    get(...params) {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) {
          const cleaned = params.map(p => p === undefined ? null : p);
          stmt.bind(cleaned);
        }
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const obj = {};
          cols.forEach((c, i) => obj[c] = vals[i]);
          return obj;
        }
        return undefined;
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) {
          const cleaned = params.map(p => p === undefined ? null : p);
          stmt.bind(cleaned);
        }
        const results = [];
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const obj = {};
          cols.forEach((c, i) => obj[c] = vals[i]);
          results.push(obj);
        }
        return results;
      } finally {
        stmt.free();
      }
    }
  };
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { initDb, prepare, encrypt, decrypt, saveDb };
