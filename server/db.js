const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'game.db');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  // Load existing db or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY,
      session_token TEXT,
      socket_id TEXT,
      is_online INTEGER DEFAULT 0,
      last_login TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS game1_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      title TEXT,
      answer TEXT,
      sort_order INTEGER,
      allow_frontend_play INTEGER DEFAULT 1
    )
  `);

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS game2_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      real_image TEXT,
      fake_image TEXT,
      real_position TEXT,
      sort_order INTEGER
    )
  `);

  db.run(`
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

  db.run(`
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

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS game_state (
      game_id TEXT PRIMARY KEY,
      current_question INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      is_answer_shown INTEGER DEFAULT 0,
      extra_data TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      group_id INTEGER,
      game_id TEXT,
      score INTEGER DEFAULT 0,
      PRIMARY KEY(group_id, game_id)
    )
  `);

  // Initialize game states
  const games = ['game1', 'game2', 'game3', 'game4'];
  games.forEach(g => {
    const existing = db.exec(`SELECT * FROM game_state WHERE game_id = '${g}'`);
    if (existing.length === 0) {
      db.run(`INSERT INTO game_state (game_id, current_question, is_active, is_answer_shown) VALUES ('${g}', 0, 0, 0)`);
    }
  });

  // Initialize config
  const defaultConfig = {
    group_count: process.env.GROUP_COUNT || '10',
    extensions_enabled: '0'
  };
  for (const [key, value] of Object.entries(defaultConfig)) {
    const existing = db.exec(`SELECT * FROM config WHERE key = '${key}'`);
    if (existing.length === 0) {
      db.run(`INSERT INTO config (key, value) VALUES ('${key}', '${value}')`);
    }
  }

  // Initialize groups
  const groupCount = parseInt(getConfig('group_count'));
  for (let i = 1; i <= groupCount; i++) {
    const existing = db.exec(`SELECT * FROM groups WHERE id = ${i}`);
    if (existing.length === 0) {
      db.run(`INSERT INTO groups (id, is_online) VALUES (${i}, 0)`);
    }
  }
  // Migrations: add new columns to existing tables
  try {
    db.run(`ALTER TABLE game1_videos ADD COLUMN allow_frontend_play INTEGER DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }

  saveDB();
  console.log('Database initialized successfully');
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Helper functions
function getConfig(key) {
  const result = db.exec(`SELECT value FROM config WHERE key = '${key}'`);
  return result.length > 0 ? result[0].values[0][0] : null;
}

function setConfig(key, value) {
  db.run(`INSERT OR REPLACE INTO config (key, value) VALUES ('${key}', '${value}')`);
  saveDB();
}

function runQuery(sql, params = []) {
  try {
    db.run(sql, params);
    saveDB();
    return true;
  } catch (e) {
    console.error('DB Error:', e.message);
    return false;
  }
}

function getAll(sql) {
  try {
    const result = db.exec(sql);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  } catch (e) {
    console.error('DB Error:', e.message);
    return [];
  }
}

function getOne(sql) {
  const results = getAll(sql);
  return results.length > 0 ? results[0] : null;
}

function getDB() {
  return db;
}

module.exports = {
  initDB, saveDB, getConfig, setConfig, runQuery, getAll, getOne, getDB
};
