const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { getAll, getOne, runQuery } = require('../db');

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

// Generate image from sketch
router.post('/generate/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { imageData } = req.body;

  // Check attempts
  const submissions = getAll(`SELECT * FROM game4_submissions WHERE group_id = ${groupId}`);
  if (submissions.length >= 3) {
    return res.status(400).json({ error: '已用完所有机会（3次）' });
  }

  try {
    // Step 1: Generate image from sketch using Gemini
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
    
    // Extract generated image from response
    const message = genData.choices?.[0]?.message;
    if (message?.content) {
      if (typeof message.content === 'string') {
        // API returns Markdown: ![image](data:image/png;base64,...)
        // Try to extract from markdown image syntax first
        const mdMatch = message.content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
        if (mdMatch) {
          generatedImage = mdMatch[1];
        } else {
          // Fallback: match data URI directly (up to end or whitespace)
          const rawMatch = message.content.match(/(data:image\/\w+;base64,[A-Za-z0-9+/=]+)/);
          if (rawMatch) generatedImage = rawMatch[1];
        }
      }
      // Check for multimodal array response
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

    const attemptNum = submissions.length + 1;

    // Save sketch and generated image
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
    res.status(500).json({ error: 'AI生成失败，请重试' });
  }
});

// Get score
router.get('/score/:groupId', (req, res) => {
  const result = getOne(`SELECT SUM(score) as total FROM game4_submissions WHERE group_id = ${req.params.groupId}`);
  res.json({ score: result?.total || 0 });
});

module.exports = router;
