const { Pool } = require('pg');
const crypto = require('crypto');

const ENCRYPTION_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || 'test-app-secret-key-change-in-prod', 'salt', 32);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        full_name TEXT,
        team_name TEXT,
        login_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tests (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        max_violations INTEGER NOT NULL DEFAULT 5,
        is_published INTEGER DEFAULT 0,
        randomize_questions INTEGER DEFAULT 1,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        test_id INTEGER,
        question_text TEXT NOT NULL,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer TEXT,
        marks INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        test_id INTEGER,
        started_at TIMESTAMP DEFAULT NOW(),
        submitted_at TIMESTAMP,
        is_submitted INTEGER DEFAULT 0,
        score INTEGER,
        total_marks INTEGER,
        answers_encrypted TEXT,
        question_order TEXT
      );
      CREATE TABLE IF NOT EXISTS violations (
        id SERIAL PRIMARY KEY,
        session_id INTEGER,
        user_id INTEGER,
        test_id INTEGER,
        type TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        details TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

function prepare(sql) {
  // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
  let paramIndex = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  return {
    async run(...params) {
      const cleaned = params.map(p => p === undefined ? null : p);
      const result = await pool.query(pgSql + ' RETURNING id', cleaned).catch(async () => {
        // If RETURNING fails (UPDATE/DELETE), run without it
        await pool.query(pgSql, cleaned);
        return { rows: [{ id: 0 }] };
      });
      return { lastInsertRowid: result.rows[0] ? result.rows[0].id : 0 };
    },
    async get(...params) {
      const cleaned = params.map(p => p === undefined ? null : p);
      const result = await pool.query(pgSql, cleaned);
      return result.rows[0] || undefined;
    },
    async all(...params) {
      const cleaned = params.map(p => p === undefined ? null : p);
      const result = await pool.query(pgSql, cleaned);
      return result.rows;
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

module.exports = { initDb, prepare, encrypt, decrypt };
