const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'game.db');

let db = null;

async function initDB() {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(DB_PATH);

  // WAL 模式：提升并发读写性能，防止写入时阻塞读取
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY,
      session_token TEXT,
      socket_id TEXT,
      is_online INTEGER DEFAULT 0,
      last_login TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game1_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      title TEXT,
      answer TEXT,
      sort_order INTEGER,
      allow_frontend_play INTEGER DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game1_submissions (
      group_id INTEGER,
      video_id INTEGER,
      answer TEXT,
      play_count INTEGER DEFAULT 0,
      is_correct INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      submitted_at TEXT,
      PRIMARY KEY(group_id, video_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game2_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      real_image TEXT,
      fake_image TEXT,
      real_position TEXT,
      sort_order INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game2_submissions (
      group_id INTEGER,
      face_id INTEGER,
      answer TEXT,
      is_correct INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      submitted_at TEXT,
      PRIMARY KEY(group_id, face_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game3_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER,
      theme TEXT,
      theme_index INTEGER,
      recognized_as TEXT,
      is_correct INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      submitted_at TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game4_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER,
      attempt_number INTEGER,
      sketch_path TEXT,
      generated_path TEXT,
      score INTEGER DEFAULT 0,
      submitted_at TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game_state (
      game_id TEXT PRIMARY KEY,
      current_question INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      is_answer_shown INTEGER DEFAULT 0,
      extra_data TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      group_id INTEGER,
      game_id TEXT,
      score INTEGER DEFAULT 0,
      PRIMARY KEY(group_id, game_id)
    )
  `);

  // Initialize game states
  const insertGameState = db.prepare(
    `INSERT OR IGNORE INTO game_state (game_id, current_question, is_active, is_answer_shown) VALUES (?, 0, 0, 0)`
  );
  ['game1', 'game2', 'game3', 'game4'].forEach(g => insertGameState.run(g));

  // Initialize config
  const insertConfig = db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`);
  insertConfig.run('group_count', process.env.GROUP_COUNT || '10');
  insertConfig.run('extensions_enabled', '0');

  // Initialize groups
  const groupCount = parseInt(getConfig('group_count'));
  const insertGroup = db.prepare(`INSERT OR IGNORE INTO groups (id, is_online) VALUES (?, 0)`);
  for (let i = 1; i <= groupCount; i++) {
    insertGroup.run(i);
  }

  // Migrations: add new columns to existing tables (safe: errors = already exists)
  try {
    db.exec(`ALTER TABLE game1_videos ADD COLUMN allow_frontend_play INTEGER DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }

  console.log('Database initialized successfully');
  return db;
}

// No-op：better-sqlite3 每次写操作自动持久化到磁盘，无需手动保存
function saveDB() {}

function getConfig(key) {
  const row = db.prepare(`SELECT value FROM config WHERE key = ?`).get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`).run(key, value);
}

function runQuery(sql, params = []) {
  try {
    // 用展开运算符传参：better-sqlite3 不接受数组直接传入，需展开为位置参数
    db.prepare(sql).run(...params);
    return true;
  } catch (e) {
    console.error('DB Error:', e.message, '\nSQL:', sql);
    return false;
  }
}

function getAll(sql) {
  try {
    return db.prepare(sql).all();
  } catch (e) {
    console.error('DB Error:', e.message, '\nSQL:', sql);
    return [];
  }
}

function getOne(sql) {
  try {
    return db.prepare(sql).get() || null;
  } catch (e) {
    console.error('DB Error:', e.message, '\nSQL:', sql);
    return null;
  }
}

function getDB() {
  return db;
}

module.exports = {
  initDB, saveDB, getConfig, setConfig, runQuery, getAll, getOne, getDB
};
