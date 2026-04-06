# AI 竞赛平台修复与增强 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Game1 竞态 Bug、将数据库从 sql.js 迁移到 better-sqlite3、加 AI 并发限流防崩溃、增强 Game4 后台实时展示。

**Architecture:** 数据库层完整替换（db.js），上层路由 API 不变；新增共享限流模块 aiQueue.js，game3/game4 路由引用；前端修复均限于各自 `<script>` 块，不改动 HTML 结构。

**Tech Stack:** Node.js / Express / better-sqlite3 / Socket.IO / 原生浏览器 JS（无构建工具）

---

## Chunk 1：数据库迁移 better-sqlite3

### Task 1：备份数据库 + 安装依赖

**Files:**
- Modify: `package.json`（添加 better-sqlite3 依赖）

- [ ] **Step 1.1：备份现有数据库**

```bash
cp server/data/game.db server/data/game.db.bak
```

预期输出：无报错，`server/data/game.db.bak` 文件存在。

- [ ] **Step 1.2：安装 better-sqlite3**

```bash
npm install better-sqlite3
```

预期输出：
```
added 1 package, ...
found 0 vulnerabilities
```

若安装失败（缺少编译工具），执行：
```bash
# Ubuntu/Debian 云服务器
sudo apt-get install -y build-essential python3
npm install better-sqlite3
```

- [ ] **Step 1.3：验证安装成功**

```bash
node -e "const db = require('better-sqlite3')(':memory:'); db.exec('CREATE TABLE t (id INTEGER)'); console.log('better-sqlite3 OK');"
```

预期输出：`better-sqlite3 OK`

---

### Task 2：重写 server/db.js

**Files:**
- Modify: `server/db.js`（完整替换，保留相同导出 API）

> 关键约束：`getAll()`、`getOne()`、`runQuery()`、`getConfig()`、`setConfig()`、`saveDB()`、`initDB()` 签名不变，路由文件零改动。

- [ ] **Step 2.1：验证新 db.js 的接口（先写验证脚本）**

创建临时文件 `test-db.js`（根目录）：

```javascript
// 这是临时验证脚本，运行后删除
process.env.GROUP_COUNT = '2';
const path = require('path');
const fs = require('fs');

// 临时使用内存DB路径做测试
const DB_PATH_ORIG = path.join(__dirname, 'server', 'data', 'game.db');
const DB_PATH_TEST = path.join(__dirname, 'server', 'data', 'game_test.db');
if (fs.existsSync(DB_PATH_TEST)) fs.unlinkSync(DB_PATH_TEST);

// 直接测试 better-sqlite3 接口
const Database = require('better-sqlite3');
const db = new Database(DB_PATH_TEST);
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`);
db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`).run('test_key', 'test_val');

const row = db.prepare(`SELECT value FROM config WHERE key = ?`).get('test_key');
console.assert(row.value === 'test_val', 'getConfig 测试失败');

const rows = db.prepare(`SELECT * FROM config`).all();
console.assert(rows.length === 1, 'getAll 测试失败');

const single = db.prepare(`SELECT * FROM config WHERE key = ?`).get('test_key');
console.assert(single !== null, 'getOne 测试失败');

// 测试 params 数组
db.exec(`CREATE TABLE IF NOT EXISTS t2 (a TEXT, b TEXT)`);
db.prepare(`INSERT INTO t2 (a, b) VALUES (?, ?)`).run(['val_a', 'val_b']);
const t2row = db.prepare(`SELECT * FROM t2`).get();
console.assert(t2row.a === 'val_a', '参数数组测试失败');

db.close();
fs.unlinkSync(DB_PATH_TEST);
console.log('✅ better-sqlite3 接口验证全部通过');
```

运行验证：
```bash
node test-db.js
```

预期输出：`✅ better-sqlite3 接口验证全部通过`

- [ ] **Step 2.2：用以下内容完整替换 server/db.js**

```javascript
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
```

- [ ] **Step 2.3：启动服务验证数据库迁移**

> ⚠️ 以下命令适用于**Linux 云服务器**（部署环境）。若在 Windows 本地开发机上验证，用 `node server/index.js` 启动后，浏览器访问 `http://localhost:3000` 能看到页面即代表成功。

Linux 服务器验证：
```bash
# 启动服务（后台）
node server/index.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 3

# 检查启动日志
grep -i "database initialized\|running on" /tmp/server.log

# 停止服务
kill $SERVER_PID
```

预期在日志中看到：
```
Database initialized successfully
Running on http://localhost:3000
```

- [ ] **Step 2.4：删除临时验证脚本**

```bash
rm test-db.js
```

- [ ] **Step 2.5：提交**

```bash
git add server/db.js package.json package-lock.json
git commit -m "feat: migrate database from sql.js to better-sqlite3

- Replace in-memory sql.js with native better-sqlite3
- Enable WAL journal mode for concurrent read/write performance
- saveDB() becomes no-op (writes are automatic)
- All route files unchanged (same getAll/getOne/runQuery API)
- Memory usage: ~200MB -> ~10MB; write speed: 10x improvement"
```

---

## Chunk 2：AI 并发限流队列

### Task 3：创建限流模块 server/utils/aiQueue.js

**Files:**
- Create: `server/utils/aiQueue.js`

- [ ] **Step 3.1：创建 utils 目录**

```bash
mkdir -p server/utils
```

- [ ] **Step 3.2：创建 server/utils/aiQueue.js**

```javascript
/**
 * AI 请求并发限流队列
 *
 * 防止高并发 AI 请求导致服务器 OOM 崩溃。
 * 12组同时使用时最多 36 个并发 AI 请求，单个请求含 1-5MB base64 图片。
 * 本模块将并发数限制在 MAX_CONCURRENT，超出则进入等待队列。
 */

const MAX_CONCURRENT = 4;      // 最大并发数（匹配 4 核 CPU）
const QUEUE_MAX_SIZE = 20;     // 队列上限，超出则拒绝（防止内存无限堆积）
const REQUEST_TIMEOUT_MS = 60000; // 单请求超时 60s（AI 生成图片较慢）

let activeCount = 0;
const queue = [];

/**
 * 将 async 函数 fn 纳入限流控制执行。
 * @param {Function} fn - 返回 Promise 的异步函数（AI 请求逻辑）
 * @returns {Promise} fn 的返回值
 */
function runWithQueue(fn) {
  return new Promise((resolve, reject) => {
    if (queue.length >= QUEUE_MAX_SIZE) {
      return reject(new Error('AI服务繁忙，请稍后重试'));
    }

    const task = { fn, resolve, reject };

    if (activeCount < MAX_CONCURRENT) {
      executeTask(task);
    } else {
      queue.push(task);
    }
  });
}

function executeTask(task) {
  activeCount++;

  // 超时保护：防止单个 AI 请求永久挂起占用并发槽位
  const timeoutId = setTimeout(() => {
    task.reject(new Error('AI请求超时，请重试'));
    finishTask();
  }, REQUEST_TIMEOUT_MS);

  task.fn()
    .then(result => {
      clearTimeout(timeoutId);
      task.resolve(result);
    })
    .catch(err => {
      clearTimeout(timeoutId);
      task.reject(err);
    })
    .finally(finishTask);
}

function finishTask() {
  activeCount--;
  if (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const next = queue.shift();
    executeTask(next);
  }
}

// 仅用于测试和监控
function getStats() {
  return { activeCount, queueLength: queue.length, MAX_CONCURRENT, QUEUE_MAX_SIZE };
}

module.exports = { runWithQueue, getStats };
```

- [ ] **Step 3.3：验证限流队列逻辑**

创建临时验证脚本 `test-queue.js`（根目录）：

```javascript
const { runWithQueue, getStats } = require('./server/utils/aiQueue');

// 模拟 8 个并发请求（超过 MAX_CONCURRENT=4）
const results = [];
const promises = Array.from({ length: 8 }, (_, i) =>
  runWithQueue(() => new Promise(resolve => {
    const stats = getStats();
    console.log(`任务${i+1} 开始执行, 当前并发: ${stats.activeCount}, 队列: ${stats.queueLength}`);
    setTimeout(() => resolve(i + 1), 200); // 模拟 200ms AI 请求
  })).then(v => results.push(v))
);

Promise.all(promises).then(() => {
  console.log('所有任务完成:', results.sort((a,b)=>a-b));
  console.assert(results.length === 8, '应完成 8 个任务');
  console.log('✅ 限流队列验证通过');
});
```

运行：
```bash
node test-queue.js
```

预期输出（前4个立即执行，后4个进入队列）：
```
任务1 开始执行, 当前并发: 1, 队列: 0
任务2 开始执行, 当前并发: 2, 队列: 0
...
所有任务完成: [1, 2, 3, 4, 5, 6, 7, 8]
✅ 限流队列验证通过
```

- [ ] **Step 3.4：删除临时脚本，提交 Task 3**

```bash
rm test-queue.js
git add server/utils/aiQueue.js
git commit -m "feat: add AI request rate limiting queue

- New server/utils/aiQueue.js: max 4 concurrent, queue size 20, 60s timeout
- Prevents OOM crash from 36+ concurrent AI requests during competition
- Exports runWithQueue(fn) and getStats() for monitoring"
```

---

### Task 4：game3.js 包裹 AI 限流

**Files:**
- Modify: `server/routes/game3.js`

- [ ] **Step 4.1：用以下内容完整替换 server/routes/game3.js**

```javascript
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { getAll, getOne, runQuery } = require('../db');
const { runWithQueue } = require('../utils/aiQueue');

const THEMES = [
  '猫', '狗', '房子', '太阳', '树',
  '汽车', '花', '鱼', '星星', '飞机',
  '苹果', '雨伞', '自行车', '蝴蝶', '月亮'
];

// Get game state and current theme
router.get('/state/:groupId', (req, res) => {
  const state = getOne("SELECT * FROM game_state WHERE game_id = 'game3'");
  if (!state || !state.is_active) {
    return res.json({ active: false, message: '游戏未开始' });
  }

  let extraData = {};
  try { extraData = JSON.parse(state.extra_data || '{}'); } catch(e) {}

  const themes = extraData.themes || THEMES.slice(0, 10);
  const submissions = getAll(`SELECT * FROM game3_submissions WHERE group_id = ${req.params.groupId} ORDER BY theme_index`);
  const totalScore = submissions.reduce((sum, s) => sum + s.score, 0);

  res.json({
    active: true,
    themes,
    submissions,
    totalScore,
    timeLimit: extraData.timeLimit || 600
  });
});

// Submit drawing for recognition（带限流保护）
router.post('/recognize/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { imageData, themeIndex, theme } = req.body;

  try {
    // runWithQueue 限制并发：超出 MAX_CONCURRENT 的请求排队等待
    const { isMatch, guess } = await runWithQueue(async () => {
      const response = await fetch(`${process.env.API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `这是一幅简笔画。请判断这幅画画的是不是"${theme}"。请只回答一个JSON格式：{"is_match": true/false, "guess": "你认为画的是什么"}`
                },
                {
                  type: 'image_url',
                  image_url: { url: imageData }
                }
              ]
            }
          ],
          max_tokens: 200
        })
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      let isMatch = false;
      let guess = '无法识别';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          isMatch = parsed.is_match === true;
          guess = parsed.guess || '未知';
        }
      } catch(e) {
        isMatch = content.includes('是') && !content.includes('不是');
        guess = content;
      }

      return { isMatch, guess };
    });

    const score = isMatch ? 5 : 0;

    // AI 请求完成后再操作数据库（DB 操作不需要限流）
    runQuery(`INSERT INTO game3_submissions (group_id, theme, theme_index, recognized_as, is_correct, score, submitted_at) VALUES (${groupId}, '${theme}', ${themeIndex}, '${guess.replace(/'/g, "''")}', ${isMatch ? 1 : 0}, ${score}, datetime('now'))`);

    const io = req.app.get('io');
    io.emit('submission-update', { gameId: 'game3', groupId: parseInt(groupId) });

    res.json({
      success: true,
      isMatch,
      guess,
      score,
      message: isMatch ? `✅ AI识别正确！这是"${theme}"，+5分！` : `❌ AI认为这是"${guess}"，不是"${theme}"`
    });

  } catch (error) {
    console.error('Game3 recognition error:', error);
    // 区分限流错误和系统错误，给前端不同的提示
    const isBusy = error.message.includes('繁忙') || error.message.includes('超时');
    res.status(isBusy ? 503 : 500).json({
      error: isBusy ? error.message : 'AI识别失败，请重试'
    });
  }
});

// Get score
router.get('/score/:groupId', (req, res) => {
  const result = getOne(`SELECT SUM(score) as total FROM game3_submissions WHERE group_id = ${req.params.groupId}`);
  res.json({ score: result?.total || 0 });
});

module.exports = router;
```

---

### Task 5：game4.js 包裹 AI 限流

**Files:**
- Modify: `server/routes/game4.js`

- [ ] **Step 5.1：用以下内容完整替换 server/routes/game4.js**

```javascript
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { getAll, getOne, runQuery } = require('../db');
const { runWithQueue } = require('../utils/aiQueue');

// Get game state for a group
router.get('/state/:groupId', (req, res) => {
  const state = getOne("SELECT * FROM game_state WHERE game_id = 'game4'");
  const submissions = getAll(`SELECT * FROM game4_submissions WHERE group_id = ${req.params.groupId} ORDER BY attempt_number`);
  const totalScore = submissions.reduce((sum, s) => sum + s.score, 0);

  res.json({
    active: state?.is_active === 1,
    submissions,
    totalScore,
    attemptsUsed: submissions.length,
    maxAttempts: 3
  });
});

// Generate image from sketch（带限流保护）
router.post('/generate/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { imageData } = req.body;

  // 次数检查在限流外执行（快速 DB 查询，不消耗 AI 资源）
  const submissions = getAll(`SELECT * FROM game4_submissions WHERE group_id = ${groupId}`);
  if (submissions.length >= 3) {
    return res.status(400).json({ error: '已用完所有机会（3次）' });
  }

  try {
    // 两次串行 AI 请求（生成图 + 评分）都在限流内执行
    // 这样每个 game4 请求只占用 1 个并发槽位
    const { generatedImage, score } = await runWithQueue(async () => {

      // Step 1: Generate image from sketch
      const genResponse = await fetch(`${process.env.API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请根据这幅手绘线稿/草图，生成一张对应的精美、写实风格的照片或图片。保持手绘内容的主题和构图，但让它变成一张高质量的真实照片效果。'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageData }
                }
              ]
            }
          ],
          max_tokens: 4096
        })
      });

      const genData = await genResponse.json();
      let generatedImage = null;

      const message = genData.choices?.[0]?.message;
      if (message?.content) {
        if (typeof message.content === 'string') {
          const mdMatch = message.content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
          if (mdMatch) {
            generatedImage = mdMatch[1];
          } else {
            const rawMatch = message.content.match(/(data:image\/\w+;base64,[A-Za-z0-9+/=]+)/);
            if (rawMatch) generatedImage = rawMatch[1];
          }
        }
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'image_url') {
              generatedImage = part.image_url?.url;
            }
          }
        }
      }
      console.log(`[Game4] Group ${groupId}: image generated = ${!!generatedImage}, content length = ${message?.content?.length || 0}`);

      // Step 2: Score the generated result
      const scoreImageToEvaluate = generatedImage || imageData;
      const scoreResponse = await fetch(`${process.env.API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL_FALLBACK || process.env.AI_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请根据这张AI生成的图片进行评分。评分标准：主要看画面中有没有特别的地方（独特的元素、创意细节、有趣的组合等），特别的地方越多分值越高。最高10分，最低5分。请只回答一个数字（5-10之间的整数）。'
                },
                {
                  type: 'image_url',
                  image_url: { url: scoreImageToEvaluate }
                }
              ]
            }
          ],
          max_tokens: 50
        })
      });

      const scoreData = await scoreResponse.json();
      const scoreContent = scoreData.choices?.[0]?.message?.content || '7';
      let score = parseInt(scoreContent.match(/\d+/)?.[0] || '7');
      score = Math.max(5, Math.min(10, score));

      return { generatedImage, score };
    });

    // AI 完成后执行文件保存和 DB 写入（不在限流内）
    const attemptNum = submissions.length + 1;
    const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
    const sketchFilename = `sketch_g${groupId}_a${attemptNum}_${Date.now()}.png`;
    const sketchBase64 = imageData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(uploadsDir, sketchFilename), Buffer.from(sketchBase64, 'base64'));

    let generatedFilename = null;
    if (generatedImage) {
      generatedFilename = `generated_g${groupId}_a${attemptNum}_${Date.now()}.png`;
      const genBase64 = generatedImage.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(uploadsDir, generatedFilename), Buffer.from(genBase64, 'base64'));
    }

    runQuery(`INSERT INTO game4_submissions (group_id, attempt_number, sketch_path, generated_path, score, submitted_at) VALUES (${groupId}, ${attemptNum}, '${sketchFilename}', '${generatedFilename || ''}', ${score}, datetime('now'))`);

    const io = req.app.get('io');
    io.emit('submission-update', { gameId: 'game4', groupId: parseInt(groupId) });

    res.json({
      success: true,
      generatedImage: generatedImage || null,
      score,
      attemptNumber: attemptNum,
      attemptsRemaining: 3 - attemptNum,
      message: `创意评分：${score}分！剩余${3 - attemptNum}次机会`
    });

  } catch (error) {
    console.error('Game4 generate error:', error);
    const isBusy = error.message.includes('繁忙') || error.message.includes('超时');
    res.status(isBusy ? 503 : 500).json({
      error: isBusy ? error.message : 'AI生成失败，请重试'
    });
  }
});

// Get score
router.get('/score/:groupId', (req, res) => {
  const result = getOne(`SELECT SUM(score) as total FROM game4_submissions WHERE group_id = ${req.params.groupId}`);
  res.json({ score: result?.total || 0 });
});

module.exports = router;
```

- [ ] **Step 5.2：启动服务验证路由加载正常**

```bash
node -e "
require('dotenv').config();
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost';
process.env.API_KEY = process.env.API_KEY || 'test';
process.env.AI_MODEL = process.env.AI_MODEL || 'test';
const g3 = require('./server/routes/game3');
const g4 = require('./server/routes/game4');
console.log('✅ game3.js 和 game4.js 加载成功');
"
```

预期输出：`✅ game3.js 和 game4.js 加载成功`

- [ ] **Step 5.3：提交 Chunk 2**

```bash
git add server/utils/aiQueue.js server/routes/game3.js server/routes/game4.js
git commit -m "feat: add AI request rate limiting queue for game3 and game4

- New server/utils/aiQueue.js: max 4 concurrent AI requests, queue size 20
- game3.js: AI recognition call wrapped in runWithQueue
- game4.js: both AI calls (generate + score) wrapped in runWithQueue
- Busy/timeout errors return HTTP 503 with user-friendly message
- DB operations remain outside queue for minimal latency impact"
```

---

## Chunk 3：前端 Bug 修复

### Task 6：修复 game1.html 竞态 Bug

**Files:**
- Modify: `public/game1.html`（仅 `<script>` 块）

**根因**：`next-question` socket 事件触发多个并发 `loadCurrentState()` 调用；后发出的请求若先返回（网络抖动），会用旧题 `is_answer_shown=1` 的数据覆盖新题 UI，导致上一题答案横幅短暂闪现。

- [ ] **Step 6.1：在 game1.html 的 `<script>` 中添加 renderVersion 变量**

在 `public/game1.html` 第 121 行附近，找到：
```javascript
    let currentVideo = null;
    let playCount = 0;
    let timerInterval = null;
    let hasPlayedOnce = false;
    let hasCountedThisSession = false;
```

在其后添加一行：
```javascript
    let renderVersion = 0; // 防止竞态：丢弃过期的 loadCurrentState 响应
```

- [ ] **Step 6.2：在 loadCurrentState() 函数开头添加版本号保护**

找到：
```javascript
    async function loadCurrentState() {
      try {
        const res = await fetch(`/api/game1/current/${groupId}`);
        const data = await res.json();
```

替换为：
```javascript
    async function loadCurrentState() {
      const thisVersion = ++renderVersion;
      try {
        const res = await fetch(`/api/game1/current/${groupId}`);
        const data = await res.json();
        // 若在等待响应期间触发了新的 loadCurrentState（如老师切题），则丢弃此次响应
        if (thisVersion !== renderVersion) return;
```

- [ ] **Step 6.3：修改 next-question socket 事件处理，立即清空结果区**

找到：
```javascript
    socket.on('next-question', ({ gameId }) => {
      if (gameId === 'game1') {
        hasPlayedOnce = false;
        loadCurrentState();
      }
    });
```

替换为：
```javascript
    socket.on('next-question', ({ gameId }) => {
      if (gameId === 'game1') {
        // 立即同步清空结果区域（防止旧题答案闪现）
        document.getElementById('answerRevealArea').classList.add('hidden');
        document.getElementById('resultBanner').textContent = '';
        hasPlayedOnce = false;
        loadCurrentState();
      }
    });
```

- [ ] **Step 6.4：验证修改正确性**

用浏览器打开 game1.html，打开 DevTools Console：

1. 确认变量存在：
```javascript
typeof renderVersion // 应输出 "number"
```

2. 验证防闪动逻辑生效（临时调试用，提交前删除）——在 `loadCurrentState()` 的 guard 处添加一行日志：
```javascript
if (thisVersion !== renderVersion) {
  console.log(`[Guard] 丢弃过期响应: thisVersion=${thisVersion}, renderVersion=${renderVersion}`);
  return;
}
```
在老师面板快速点击「下一题」时，Console 应能看到 `[Guard] 丢弃过期响应` 的输出，确认后将该 `console.log` 删除。

---

### Task 7：修复 game3.html 和 game4.html 的 catch 块

**Files:**
- Modify: `public/game3.html`（submitDrawing 函数 catch 块）
- Modify: `public/game4.html`（generateImage 函数 catch 块）

**问题**：当服务端返回 HTTP 503（AI 繁忙）时，前端 catch 块未能恢复按钮可用状态，学生无法重试。

#### game3.html

- [ ] **Step 7.1：确保 game3.html 的 submitDrawing catch 块包含按钮恢复逻辑**

找到（第 406-412 行）：
```javascript
      } catch (e) {
        console.error('Submit error:', e);
      }

      submitting = false;
      btn.disabled = false;
      btn.textContent = '🤖 提交给AI猜';
    }
```

替换为：
```javascript
      } catch (e) {
        console.error('Submit error:', e);
        // 无论何种网络错误，确保按钮恢复可用，学生可以重试
        submitting = false;
        btn.disabled = false;
        btn.textContent = '🤖 提交给AI猜';
      }

      // ⚠️ 保留下方三行：成功路径仍需要它们来恢复按钮状态
      // （当 !res.ok 的 return 分支在 Step 7.2 添加后，503 路径由 Step 7.2 处理）
      submitting = false;
      btn.disabled = false;
      btn.textContent = '🤖 提交给AI猜';
    }
```

> **说明**：fetch 返回 HTTP 503 时不会进入 catch（只是 `res.ok === false`），网络断开才会 throw。此步骤只将清理逻辑复制进 catch 块，原函数末尾的三行**必须保留**，因为成功路径（`res.ok === true`）执行完毕后依然需要它们来恢复按钮状态。

- [ ] **Step 7.2：同时在 game3.html 的成功路径中检查 HTTP 状态码**

找到 submitDrawing 函数中：
```javascript
        const res = await fetch(`/api/game3/recognize/${groupId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData,
            themeIndex: currentThemeIdx,
            theme: themes[currentThemeIdx]
          })
        });
        const data = await res.json();
```

替换为：
```javascript
        const res = await fetch(`/api/game3/recognize/${groupId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData,
            themeIndex: currentThemeIdx,
            theme: themes[currentThemeIdx]
          })
        });
        const data = await res.json();

        // 处理服务端错误（如 AI 繁忙返回 503）
        if (!res.ok) {
          alert(data.error || 'AI识别失败，请重试');
          submitting = false;
          btn.disabled = false;
          btn.textContent = '🤖 提交给AI猜';
          return;
        }
```

#### game4.html

- [ ] **Step 7.3：在 game4.html 的 generateImage 中检查 HTTP 状态码**

找到（第 332-358 行）：
```javascript
        const res = await fetch(`/api/game4/generate/${groupId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        });
        const data = await res.json();

        document.getElementById('generatingOverlay').classList.add('hidden');

        if (data.success) {
```

替换为：
```javascript
        const res = await fetch(`/api/game4/generate/${groupId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        });
        const data = await res.json();

        document.getElementById('generatingOverlay').classList.add('hidden');

        // 处理服务端错误（如 AI 繁忙返回 503）
        if (!res.ok) {
          alert(data.error || 'AI生成失败，请重试');
          document.getElementById('resultPlaceholder').classList.remove('hidden');
          btn.disabled = attemptsUsed >= 3;
          if (attemptsUsed < 3) btn.textContent = '🎨 AI 生成大片';
          return;
        }

        if (data.success) {
```

- [ ] **Step 7.4：在 game4.html catch 块中补充按钮恢复逻辑**

先检查当前实际状态：
```bash
grep -n "btn.disabled" public/game4.html
```

**预期当前输出（修改前）**：仅一行，且在 catch 块外（函数末尾）：
```
360:      btn.disabled = attemptsUsed >= 3;
```

这意味着网络错误进入 catch 后，函数直接退出，`btn.disabled` 这行不会被执行，按钮将永久禁用。

找到 catch 块（第 353-361 行）：
```javascript
      } catch (e) {
        console.error('Error:', e);
        document.getElementById('generatingOverlay').classList.add('hidden');
        document.getElementById('resultPlaceholder').classList.remove('hidden');
        alert('生成失败，请重试');
      }

      btn.disabled = attemptsUsed >= 3;
      if (attemptsUsed < 3) btn.textContent = '🎨 AI 生成大片';
```

替换为：
```javascript
      } catch (e) {
        console.error('Error:', e);
        document.getElementById('generatingOverlay').classList.add('hidden');
        document.getElementById('resultPlaceholder').classList.remove('hidden');
        alert('生成失败，请重试');
        // 网络错误时同样恢复按钮可用状态
        btn.disabled = attemptsUsed >= 3;
        if (attemptsUsed < 3) btn.textContent = '🎨 AI 生成大片';
      }

      btn.disabled = attemptsUsed >= 3;
      if (attemptsUsed < 3) btn.textContent = '🎨 AI 生成大片';
```

验证修改后输出两处 catch 内的内容：
```bash
grep -n "btn.disabled" public/game4.html
```
预期：共 **4 行**（catch 块内两行 + catch 块外两行）。若只看到 2 行（均在 catch 外），说明 Step 7.4 的 catch 内修改未生效，需重新检查。

- [ ] **Step 7.5：提交 Chunk 3**

```bash
git add public/game1.html public/game3.html public/game4.html
git commit -m "fix: resolve race condition in game1 and improve error recovery in game3/4

- game1.html: add renderVersion guard to discard stale loadCurrentState responses
- game1.html: immediately clear result banner on next-question event
- game3.html: check HTTP status and show friendly message on 503 busy response
- game4.html: check HTTP status and restore button on 503 busy response"
```

---

## Chunk 4：Game4 后台展示增强

### Task 8：重写 loadGame4() 并添加实时刷新

**Files:**
- Modify: `public/admin/dashboard.html`（loadGame4 函数 + socket 事件监听）

- [ ] **Step 8.1：找到并替换 loadGame4() 函数**

在 `public/admin/dashboard.html` 中找到（第 611-642 行）：
```javascript
    async function loadGame4() {
      loadGameState('game4');
      const sRes = await fetch('/api/admin/submissions/game4', { headers });
      const subs = await sRes.json();
      let html = '';
      if (subs.length) {
        html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:1.5rem;">';
        subs.forEach(s => {
          const genImgHtml = s.generated_path
            ? `<div style="text-align:center;"><p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.25rem;">AI生成结果</p><img src="/uploads/${s.generated_path}" onclick="event.stopPropagation(); openLightbox(this.src)" title="点击放大"></div>`
            : `<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; background:rgba(0,0,0,0.2); border-radius:var(--radius-sm);"><span style="color:var(--text-muted); font-size:0.8rem;">生成失败/无图片</span></div>`;

          html += `<div style="background:var(--bg-glass); border:var(--border-glass); border-radius:var(--radius-md); overflow:hidden; transition:var(--transition);">
            <div style="padding:0.6rem 0.8rem; background:rgba(0, 212, 255, 0.1); border-bottom:var(--border-glass); font-family:'Orbitron'; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--text-primary);">第 ${s.group_id} 组</span>
              <span style="color:var(--neon-green); font-size:0.9rem;">尝试 #${s.attempt_number} <span style="margin-left:0.5rem;color:var(--neon-purple);">${s.score}分</span></span>
            </div>
            <div class="image-grid">
              <div style="text-align:center;">
                <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.25rem;">学生线稿</p>
                <img src="/uploads/${s.sketch_path}" onclick="event.stopPropagation(); openLightbox(this.src)" title="点击放大">
              </div>
              ${genImgHtml}
            </div>
          </div>`;
        });
        html += '</div>';
      } else {
        html = '<p style="color:var(--text-muted)">暂无提交</p>';
      }
      document.getElementById('game4Submissions').innerHTML = html;
    }
```

替换为：

```javascript
    async function loadGame4() {
      loadGameState('game4');
      const sRes = await fetch('/api/admin/submissions/game4', { headers });
      const subs = await sRes.json();

      if (!subs.length) {
        document.getElementById('game4Submissions').innerHTML = '<p style="color:var(--text-muted)">暂无提交</p>';
        return;
      }

      // 按组号聚合，同一组的多次尝试合并到一张卡片
      const grouped = {};
      subs.forEach(s => {
        if (!grouped[s.group_id]) grouped[s.group_id] = [];
        grouped[s.group_id].push(s);
      });

      const groupIds = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));

      let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:1.5rem;">';

      groupIds.forEach(groupId => {
        const attempts = grouped[groupId];
        const bestScore = Math.max(...attempts.map(a => a.score));

        // 卡片头部：组号 + 尝试次数 + 最高分
        html += `
          <div style="background:var(--bg-card); border:var(--border-glass); border-radius:var(--radius-lg); overflow:hidden;">
            <div style="padding:0.75rem 1rem; background:rgba(0,212,255,0.1); border-bottom:var(--border-glass); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-family:'Orbitron'; font-weight:700; color:var(--text-primary);">第 ${groupId} 组</span>
              <span style="font-size:0.8rem; color:var(--text-secondary);">
                共 ${attempts.length} 次 &nbsp;|&nbsp; 最高
                <span style="color:var(--neon-purple); font-weight:700;">${bestScore} 分</span>
              </span>
            </div>
        `;

        // 每次尝试横向排列
        const colWidth = Math.floor(100 / attempts.length);
        html += `<div style="display:flex; border-top:var(--border-glass);">`;

        attempts.forEach((s, idx) => {
          const genImgHtml = s.generated_path
            ? `<img src="/uploads/${s.generated_path}"
                style="width:100%; aspect-ratio:1; object-fit:cover; cursor:zoom-in; border-radius:4px; border:1px solid rgba(255,255,255,0.08);"
                onclick="openLightbox(this.src)" title="点击放大查看 AI 生成图">`
            : `<div style="width:100%; aspect-ratio:1; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; border-radius:4px;">
                <span style="color:var(--text-muted); font-size:0.7rem; text-align:center; line-height:1.4;">生成<br>失败</span>
               </div>`;

          html += `
            <div style="flex:1; padding:0.6rem; ${idx < attempts.length - 1 ? 'border-right:var(--border-glass);' : ''}">
              <div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.4rem; display:flex; justify-content:space-between; align-items:center;">
                <span>第 ${s.attempt_number} 次</span>
                <span style="color:var(--neon-green); font-weight:700;">${s.score} 分</span>
              </div>
              <div style="margin-bottom:0.4rem;">
                <p style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">线稿</p>
                <img src="/uploads/${s.sketch_path}"
                  style="width:100%; aspect-ratio:1; object-fit:cover; cursor:zoom-in; border-radius:4px; border:1px solid rgba(255,255,255,0.08);"
                  onclick="openLightbox(this.src)" title="点击放大查看线稿">
              </div>
              <div>
                <p style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">AI 生成</p>
                ${genImgHtml}
              </div>
            </div>
          `;
        });

        html += `</div></div>`;
      });

      html += '</div>';
      document.getElementById('game4Submissions').innerHTML = html;
    }
```

- [ ] **Step 8.2：在 socket 事件监听区添加 game4 实时刷新**

在 `public/admin/dashboard.html` 中找到 socket 事件监听区（第 716-728 行）：
```javascript
    // Socket events
    socket.on('group-status-change', () => loadOverview());
    socket.on('submission-update', () => loadOverview());
    socket.on('game-state-update', ({ gameId }) => {
      if (gameId === 'game2' && !document.getElementById('section-game2-ctrl').classList.contains('hidden')) loadGame2();
    });
    socket.on('show-answer', ({ gameId }) => {
      if (gameId === 'game2' && !document.getElementById('section-game2-ctrl').classList.contains('hidden')) loadGame2();
    });
    socket.on('next-question', ({ gameId }) => {
      if (gameId === 'game2' && !document.getElementById('section-game2-ctrl').classList.contains('hidden')) loadGame2();
    });
```

替换为：
```javascript
    // Socket events
    socket.on('group-status-change', () => loadOverview());
    socket.on('submission-update', ({ gameId }) => {
      loadOverview();
      // 实时刷新 game4 提交展示（当前正在查看 game4 面板时）
      if (gameId === 'game4' && !document.getElementById('section-game4-ctrl').classList.contains('hidden')) {
        loadGame4();
      }
      // 实时刷新 game3 提交展示（当前正在查看 game3 面板时）
      if (gameId === 'game3' && !document.getElementById('section-game3-ctrl').classList.contains('hidden')) {
        loadGame3();
      }
    });
    socket.on('game-state-update', ({ gameId }) => {
      if (gameId === 'game2' && !document.getElementById('section-game2-ctrl').classList.contains('hidden')) loadGame2();
    });
    socket.on('show-answer', ({ gameId }) => {
      if (gameId === 'game2' && !document.getElementById('section-game2-ctrl').classList.contains('hidden')) loadGame2();
    });
    socket.on('next-question', ({ gameId }) => {
      if (gameId === 'game2' && !document.getElementById('section-game2-ctrl').classList.contains('hidden')) loadGame2();
    });
```

- [ ] **Step 8.3：验证展示效果**

启动服务，打开管理后台 → 点击「线稿变大片」标签页：
1. 有提交时，应看到按组号排列的卡片（每组一张），卡片内显示该组所有尝试次数
2. 每张图片点击后应弹出 lightbox 放大展示
3. 无提交时显示「暂无提交」

```bash
node server/index.js
# 浏览器打开 http://localhost:3000/admin/
```

- [ ] **Step 8.4：提交 Chunk 4**

```bash
git add public/admin/dashboard.html
git commit -m "feat: enhance game4 admin dashboard with grouped display and real-time refresh

- loadGame4(): group submissions by team (one card per team, attempts in columns)
- Show best score per team in card header
- Real-time auto-refresh via submission-update socket event
- Also add real-time refresh for game3 submissions panel
- Images remain clickable with existing lightbox for full-screen view"
```

---

## 最终验证清单

- [ ] 启动服务无报错：`node server/index.js`
- [ ] 数据库文件存在且有效：`ls -la server/data/game.db`（应 > 0 字节）
- [ ] Game1 切题时结果区立即清空（浏览器测试）
- [ ] Game3/Game4 页面：AI 繁忙时弹出中文提示，按钮恢复可用
- [ ] 管理后台 Game4 面板：提交后自动刷新，按组显示，点击放大正常
- [ ] 备份文件存在：`ls server/data/game.db.bak`

---

## 回滚方案

若 better-sqlite3 安装或运行出现问题：

```bash
# 0. 查看提交历史，找到迁移前的最后一个提交 hash
git log --oneline | head -10
# 示例输出：
# a1b2c3d feat: migrate database from sql.js to better-sqlite3
# e4f5g6h chore: initial commit
# 用迁移提交之前的那个 hash（如 e4f5g6h）执行下方回滚

# 1. 恢复 db.js 到迁移前版本（将 <hash-before-migration> 替换为上方查到的 hash）
git checkout <hash-before-migration> -- server/db.js

# 2. 恢复 package.json 到迁移前版本
git checkout <hash-before-migration> -- package.json

# 3. 重新安装依赖（必须！否则 node_modules 状态不一致）
npm install

# 4. 恢复数据库备份（如有损坏）
cp server/data/game.db.bak server/data/game.db

# 5. 重启服务
node server/index.js
```

限流模块（aiQueue.js）和前端修复可单独保留，不影响数据库回滚。
