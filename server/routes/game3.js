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
