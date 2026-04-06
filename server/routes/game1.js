const express = require('express');
const router = express.Router();
const { getAll, getOne, runQuery } = require('../db');

// Get current video for a group
router.get('/current/:groupId', (req, res) => {
  const { groupId } = req.params;
  const state = getOne("SELECT * FROM game_state WHERE game_id = 'game1'");
  if (!state || !state.is_active) {
    return res.json({ active: false, message: '游戏未开始' });
  }

  const video = getOne(`SELECT * FROM game1_videos WHERE sort_order = ${state.current_question}`);
  if (!video) {
    if (state.current_question === 0) {
      return res.json({ active: true, waitingForNext: true, message: '准备就绪' });
    }
    return res.json({ active: true, noMore: true, message: '所有视频已播放完毕' });
  }

  // Get submission status
  const submission = getOne(`SELECT * FROM game1_submissions WHERE group_id = ${groupId} AND video_id = ${video.id}`);
  
  // Get play count
  const playCount = submission ? submission.play_count : 0;

  res.json({
    active: true,
    video: {
      id: video.id,
      title: video.title,
      filename: video.filename,
      sortOrder: video.sort_order,
      allowFrontendPlay: video.allow_frontend_play === 1 || video.allow_frontend_play === undefined
    },
    playCount,
    maxPlays: 2,
    submitted: !!submission?.answer,
    submittedAnswer: submission?.answer,
    isCorrect: submission?.is_correct,
    score: submission?.score || 0,
    isAnswerShown: state.is_answer_shown === 1,
    currentQuestion: state.current_question
  });
});

// Record play count
router.post('/play/:groupId/:videoId', (req, res) => {
  const { groupId, videoId } = req.params;
  
  const existing = getOne(`SELECT * FROM game1_submissions WHERE group_id = ${groupId} AND video_id = ${videoId}`);
  if (existing) {
    if (existing.play_count >= 2) {
      return res.status(400).json({ error: '播放次数已达上限' });
    }
    runQuery(`UPDATE game1_submissions SET play_count = play_count + 1 WHERE group_id = ${groupId} AND video_id = ${videoId}`);
  } else {
    runQuery(`INSERT INTO game1_submissions (group_id, video_id, play_count) VALUES (${groupId}, ${videoId}, 1)`);
  }
  
  const updated = getOne(`SELECT play_count FROM game1_submissions WHERE group_id = ${groupId} AND video_id = ${videoId}`);
  res.json({ success: true, playCount: updated.play_count });
});

// Submit answer
router.post('/submit/:groupId/:videoId', (req, res) => {
  const { groupId, videoId } = req.params;
  const { answer } = req.body;
  
  const state = getOne("SELECT * FROM game_state WHERE game_id = 'game1'");
  if (state.is_answer_shown === 1) {
    return res.status(400).json({ error: '答案已公布，无法修改' });
  }

  // Check if already submitted
  const existing = getOne(`SELECT * FROM game1_submissions WHERE group_id = ${groupId} AND video_id = ${videoId}`);

  const video = getOne(`SELECT * FROM game1_videos WHERE id = ${videoId}`);
  if (!video) return res.status(404).json({ error: '视频不存在' });

  const isCorrect = answer === video.answer ? 1 : 0;
  const score = isCorrect ? 5 : 0;

  if (existing) {
    runQuery(`UPDATE game1_submissions SET answer = '${answer}', is_correct = ${isCorrect}, score = ${score}, submitted_at = datetime('now') WHERE group_id = ${groupId} AND video_id = ${videoId}`);
  } else {
    runQuery(`INSERT INTO game1_submissions (group_id, video_id, answer, play_count, is_correct, score, submitted_at) VALUES (${groupId}, ${videoId}, '${answer}', 0, ${isCorrect}, ${score}, datetime('now'))`);
  }

  // Notify admin of submission
  const io = req.app.get('io');
  io.emit('submission-update', { gameId: 'game1', groupId: parseInt(groupId), videoId: parseInt(videoId) });

  res.json({ success: true, submitted: true });
});

// Get group total score for game1
router.get('/score/:groupId', (req, res) => {
  const { groupId } = req.params;
  const result = getOne(`SELECT SUM(score) as total FROM game1_submissions WHERE group_id = ${groupId}`);
  res.json({ score: result?.total || 0 });
});

module.exports = router;
