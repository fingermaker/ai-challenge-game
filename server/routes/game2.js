const express = require('express');
const router = express.Router();
const { getAll, getOne, runQuery } = require('../db');

// Get current face pair for a group
router.get('/current/:groupId', (req, res) => {
  const state = getOne("SELECT * FROM game_state WHERE game_id = 'game2'");
  if (!state || !state.is_active) {
    return res.json({ active: false, message: '游戏未开始' });
  }

  const face = getOne(`SELECT * FROM game2_faces WHERE sort_order = ${state.current_question}`);
  if (!face) return res.json({ active: true, noMore: true, message: '所有题目已完成' });

  const submission = getOne(`SELECT * FROM game2_submissions WHERE group_id = ${req.params.groupId} AND face_id = ${face.id}`);

  res.json({
    active: true,
    face: {
      id: face.id,
      realImage: face.real_image,
      fakeImage: face.fake_image,
      realPosition: state.is_answer_shown ? face.real_position : undefined,
      sortOrder: face.sort_order
    },
    submitted: !!submission?.answer,
    submittedAnswer: submission?.answer,
    isCorrect: submission?.is_correct,
    score: submission?.score || 0,
    isAnswerShown: state.is_answer_shown === 1,
    currentQuestion: state.current_question
  });
});

// Submit answer
router.post('/submit/:groupId/:faceId', (req, res) => {
  const { groupId, faceId } = req.params;
  const { answer } = req.body; // 'left' or 'right'

  const existing = getOne(`SELECT * FROM game2_submissions WHERE group_id = ${groupId} AND face_id = ${faceId}`);
  if (existing && existing.answer) {
    return res.status(400).json({ error: '已提交过答案' });
  }

  const face = getOne(`SELECT * FROM game2_faces WHERE id = ${faceId}`);
  if (!face) return res.status(404).json({ error: '题目不存在' });

  const isCorrect = answer === face.real_position ? 1 : 0;
  const score = isCorrect ? 5 : 0;

  runQuery(`INSERT OR REPLACE INTO game2_submissions (group_id, face_id, answer, is_correct, score, submitted_at) VALUES (${groupId}, ${faceId}, '${answer}', ${isCorrect}, ${score}, datetime('now'))`);

  const io = req.app.get('io');
  io.emit('submission-update', { gameId: 'game2', groupId: parseInt(groupId), faceId: parseInt(faceId) });

  res.json({ success: true, submitted: true, isCorrect: isCorrect === 1, realPosition: face.real_position });
});

// Get group score
router.get('/score/:groupId', (req, res) => {
  const result = getOne(`SELECT SUM(score) as total FROM game2_submissions WHERE group_id = ${req.params.groupId}`);
  res.json({ score: result?.total || 0 });
});

module.exports = router;
