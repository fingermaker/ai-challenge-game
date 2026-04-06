const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, runQuery, getConfig, setConfig, saveDB } = require('../db');

// Admin auth middleware
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  next();
}

router.use(adminAuth);

// Video upload config
const videoStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'data', 'videos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `video_${Date.now()}${ext}`);
  }
});
const uploadVideo = multer({ storage: videoStorage });

// ===== Config =====
router.get('/config', (req, res) => {
  const groupCount = getConfig('group_count');
  const extensionsEnabled = getConfig('extensions_enabled');
  res.json({ groupCount: parseInt(groupCount), extensionsEnabled: extensionsEnabled === '1' });
});

router.post('/config', (req, res) => {
  const { groupCount, extensionsEnabled } = req.body;
  if (groupCount) {
    setConfig('group_count', groupCount.toString());
    // Initialize new groups if needed
    for (let i = 1; i <= groupCount; i++) {
      const existing = getOne(`SELECT * FROM groups WHERE id = ${i}`);
      if (!existing) {
        runQuery(`INSERT INTO groups (id, is_online) VALUES (${i}, 0)`);
      }
    }
  }
  if (extensionsEnabled !== undefined) {
    setConfig('extensions_enabled', extensionsEnabled ? '1' : '0');
    const io = req.app.get('io');
    io.emit('extensions-toggle', { enabled: extensionsEnabled });
  }
  res.json({ success: true });
});

// ===== Groups Status =====
router.get('/groups', (req, res) => {
  const groupCount = parseInt(getConfig('group_count'));
  const groups = getAll(`SELECT id, is_online, last_login FROM groups WHERE id <= ${groupCount} ORDER BY id`);
  res.json(groups);
});

// ===== Scores =====
router.get('/scores', (req, res) => {
  const groupCount = parseInt(getConfig('group_count'));
  const scores = [];
  for (let i = 1; i <= groupCount; i++) {
    const game1 = getAll(`SELECT SUM(score) as total FROM game1_submissions WHERE group_id = ${i}`);
    const game2 = getAll(`SELECT SUM(score) as total FROM game2_submissions WHERE group_id = ${i}`);
    const game3 = getAll(`SELECT SUM(score) as total FROM game3_submissions WHERE group_id = ${i}`);
    const game4 = getAll(`SELECT SUM(score) as total FROM game4_submissions WHERE group_id = ${i}`);

    const g1 = game1[0]?.total || 0;
    const g2 = game2[0]?.total || 0;
    const g3 = game3[0]?.total || 0;
    const g4 = game4[0]?.total || 0;

    scores.push({
      groupId: i,
      game1: g1,
      game2: g2,
      game3: g3,
      game4: g4,
      total: g1 + g2 + g3 + g4
    });
  }
  scores.sort((a, b) => b.total - a.total);
  res.json(scores);
});

// ===== Game State Control =====
router.get('/game-state/:gameId', (req, res) => {
  const state = getOne(`SELECT * FROM game_state WHERE game_id = '${req.params.gameId}'`);
  res.json(state || {});
});

router.post('/game-state/:gameId', (req, res) => {
  const { gameId } = req.params;
  const { currentQuestion, isActive, isAnswerShown, extraData } = req.body;
  const io = req.app.get('io');

  if (currentQuestion !== undefined) {
    runQuery(`UPDATE game_state SET current_question = ${currentQuestion} WHERE game_id = '${gameId}'`);
  }
  if (isActive !== undefined) {
    runQuery(`UPDATE game_state SET is_active = ${isActive ? 1 : 0} WHERE game_id = '${gameId}'`);
  }
  if (isAnswerShown !== undefined) {
    runQuery(`UPDATE game_state SET is_answer_shown = ${isAnswerShown ? 1 : 0} WHERE game_id = '${gameId}'`);
  }
  if (extraData !== undefined) {
    runQuery(`UPDATE game_state SET extra_data = ? WHERE game_id = ?`, [JSON.stringify(extraData), gameId]);
  }

  // Broadcast state change to all clients
  const newState = getOne(`SELECT * FROM game_state WHERE game_id = '${gameId}'`);
  io.emit('game-state-update', { gameId, state: newState });

  res.json({ success: true, state: newState });
});

// Next question
router.post('/next-question/:gameId', (req, res) => {
  const { gameId } = req.params;
  const io = req.app.get('io');
  
  const state = getOne(`SELECT * FROM game_state WHERE game_id = '${gameId}'`);
  const nextQ = (state?.current_question || 0) + 1;
  
  runQuery(`UPDATE game_state SET current_question = ${nextQ}, is_answer_shown = 0 WHERE game_id = '${gameId}'`);
  
  const newState = getOne(`SELECT * FROM game_state WHERE game_id = '${gameId}'`);
  io.emit('game-state-update', { gameId, state: newState });
  io.emit('next-question', { gameId, question: nextQ });
  
  res.json({ success: true, state: newState });
});

// Show answer
router.post('/show-answer/:gameId', (req, res) => {
  const { gameId } = req.params;
  const io = req.app.get('io');
  
  runQuery(`UPDATE game_state SET is_answer_shown = 1 WHERE game_id = '${gameId}'`);
  
  let answerData = {};
  const state = getOne(`SELECT * FROM game_state WHERE game_id = '${gameId}'`);
  
  if (gameId === 'game1') {
    const video = getOne(`SELECT * FROM game1_videos WHERE sort_order = ${state.current_question}`);
    if (video) answerData = { answer: video.answer, title: video.title };
  } else if (gameId === 'game2') {
    const face = getOne(`SELECT * FROM game2_faces WHERE sort_order = ${state.current_question}`);
    if (face) answerData = { realPosition: face.real_position };
  }
  
  io.emit('show-answer', { gameId, answer: answerData });
  res.json({ success: true, answer: answerData });
});

// ===== Video Management =====
router.get('/videos', (req, res) => {
  const videos = getAll('SELECT * FROM game1_videos ORDER BY sort_order');
  res.json(videos);
});

router.post('/videos', uploadVideo.single('video'), (req, res) => {
  const { title, answer } = req.body;
  const allowFrontend = req.body.allowFrontendPlay === '0' ? 0 : 1;
  const filename = req.file.filename;
  const maxOrder = getOne('SELECT MAX(sort_order) as m FROM game1_videos');
  const order = (maxOrder?.m || 0) + 1;
  
  runQuery(`INSERT INTO game1_videos (filename, title, answer, sort_order, allow_frontend_play) VALUES ('${filename}', '${title}', '${answer}', ${order}, ${allowFrontend})`);
  res.json({ success: true });
});

// Toggle allow_frontend_play for ALL videos
router.post('/videos/toggle-frontend-all', (req, res) => {
  const { mode } = req.body;
  const val = mode === 'frontend' ? 1 : 0;
  runQuery(`UPDATE game1_videos SET allow_frontend_play = ${val}`);
  res.json({ success: true, allow_frontend_play: val });
});

// Update answer for a video
router.post('/videos/:id/update-answer', (req, res) => {
  const { answer } = req.body;
  runQuery(`UPDATE game1_videos SET answer = '${answer}' WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// Toggle allow_frontend_play for a video
router.post('/videos/:id/toggle-frontend', (req, res) => {
  const video = getOne(`SELECT * FROM game1_videos WHERE id = ${req.params.id}`);
  if (!video) return res.status(404).json({ error: '视频不存在' });
  const newVal = video.allow_frontend_play ? 0 : 1;
  runQuery(`UPDATE game1_videos SET allow_frontend_play = ${newVal} WHERE id = ${req.params.id}`);
  res.json({ success: true, allow_frontend_play: newVal });
});

router.delete('/videos/:id', (req, res) => {
  const video = getOne(`SELECT * FROM game1_videos WHERE id = ${req.params.id}`);
  if (video) {
    const filepath = path.join(__dirname, '..', 'data', 'videos', video.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    runQuery(`DELETE FROM game1_videos WHERE id = ${req.params.id}`);
  }
  res.json({ success: true });
});

// ===== Face Management =====
router.get('/faces', (req, res) => {
  const faces = getAll('SELECT * FROM game2_faces ORDER BY sort_order');
  res.json(faces);
});

// ===== Game Submissions =====
router.get('/submissions/:gameId', (req, res) => {
  const { gameId } = req.params;
  let submissions = [];
  if (gameId === 'game1') {
    submissions = getAll('SELECT * FROM game1_submissions ORDER BY group_id, video_id');
  } else if (gameId === 'game2') {
    submissions = getAll('SELECT * FROM game2_submissions ORDER BY group_id, face_id');
  } else if (gameId === 'game3') {
    submissions = getAll('SELECT * FROM game3_submissions ORDER BY group_id, theme_index');
  } else if (gameId === 'game4') {
    submissions = getAll('SELECT * FROM game4_submissions ORDER BY group_id, attempt_number');
  }
  res.json(submissions);
});

// Reset game data
router.post('/reset/:gameId', (req, res) => {
  const { gameId } = req.params;
  if (gameId === 'game1') {
    runQuery('DELETE FROM game1_submissions');
  } else if (gameId === 'game2') {
    runQuery('DELETE FROM game2_submissions');
  } else if (gameId === 'game3') {
    runQuery('DELETE FROM game3_submissions');
  } else if (gameId === 'game4') {
    runQuery('DELETE FROM game4_submissions');
  }
  runQuery(`UPDATE game_state SET current_question = 0, is_active = 0, is_answer_shown = 0 WHERE game_id = '${gameId}'`);
  
  const io = req.app.get('io');
  io.emit('game-reset', { gameId });
  res.json({ success: true });
});

// ===== Clear ALL Data =====
router.post('/clear-all', (req, res) => {
  const { clearUploads } = req.body;

  // 1. Clear all submissions
  runQuery('DELETE FROM game1_submissions');
  runQuery('DELETE FROM game2_submissions');
  runQuery('DELETE FROM game3_submissions');
  runQuery('DELETE FROM game4_submissions');

  // 2. Reset all game states
  runQuery("UPDATE game_state SET current_question = 0, is_active = 0, is_answer_shown = 0, extra_data = NULL");

  // 3. Reset all group sessions
  runQuery("UPDATE groups SET session_token = NULL, socket_id = NULL, is_online = 0");

  // 4. Clear uploaded files if requested
  if (clearUploads) {
    const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(f => {
        try { fs.unlinkSync(path.join(uploadsDir, f)); } catch(e) {}
      });
    }
  }

  // 5. Notify all clients
  const io = req.app.get('io');
  io.emit('game-reset', { gameId: 'all' });
  io.emit('force-logout', { message: '比赛数据已重置，请重新登录' });

  console.log(`[Admin] All data cleared. Uploads cleared: ${!!clearUploads}`);
  res.json({ success: true, message: '所有比赛数据已清除' });
});

module.exports = router;
