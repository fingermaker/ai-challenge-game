const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { getAll, getOne, runQuery } = require('../db');
const { runWithQueue } = require('../utils/aiQueue');
const { getAIConfig } = require('../utils/aiConfig');

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

/**
 * 使用 DashScope 异步 API 生成图片
 * qwen-image-2.0-pro 使用专用的 image-generation 接口
 */
async function generateImageWithDashScope(aiCfg, prompt) {
  const isQwenImage = aiCfg.aiModelImage.startsWith('qwen-image');

  if (isQwenImage) {
    // DashScope qwen-image-2.0-pro 同步 API
    const genUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    console.log(`[Game4] Using sync image API for model: ${aiCfg.aiModelImage}`);
    const res = await fetch(genUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiCfg.apiKey}`
      },
      body: JSON.stringify({
        model: aiCfg.aiModelImage,
        input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
        parameters: { size: '512*512' }
      })
    });
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.message || data.error?.message || JSON.stringify(data);
      throw new Error(`图片生成失败: ${errMsg}`);
    }
    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image || data.output?.choices?.[0]?.message?.content?.find?.(c => c.image)?.image;
    if (!imageUrl) throw new Error('图片生成成功但未返回图片URL');
    return imageUrl;
  } else {
    // DashScope 万相图像生成 API（异步模式）
    const genUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
    
    // Step 1: 创建异步生成任务
    const createRes = await fetch(genUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiCfg.apiKey}`,
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify({
        model: aiCfg.aiModelImage,
        input: { prompt },
        parameters: { size: '512*512', n: 1 }
      })
    });

    const createData = await createRes.json();

    if (!createRes.ok || !createData.output?.task_id) {
      const errMsg = createData.message || createData.error?.message || JSON.stringify(createData);
      throw new Error(`图片生成任务创建失败: ${errMsg}`);
    }

    const taskId = createData.output.task_id;
    console.log(`[Game4] Image generation task created: ${taskId} for model ${aiCfg.aiModelImage}`);

    // Step 2: 轮询等待结果（最多 60s）
    const pollUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
    const maxWait = 60000;
    const interval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, interval));

      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${aiCfg.apiKey}` }
      });
      const pollData = await pollRes.json();
      const status = pollData.output?.task_status;

      if (status === 'SUCCEEDED') {
        const results = pollData.output?.results || [];
        if (results.length > 0 && results[0].url) {
          return results[0].url; // 返回图片 URL
        }
        throw new Error('图片生成成功但未返回图片URL');
      } else if (status === 'FAILED') {
        throw new Error(`图片生成失败: ${pollData.output?.message || '未知错误'}`);
      }
      // PENDING / RUNNING 状态继续轮询
    }

    throw new Error('图片生成超时（60秒）');
  }
}

/**
 * 下载远程图片并保存到本地，返回 base64 data URL
 */
async function downloadImageToLocal(imageUrl, savePath) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  const buffer = await res.buffer();
  fs.writeFileSync(savePath, buffer);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

// Generate image from sketch（带限流保护）
router.post('/generate/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { imageData } = req.body;

  // 次数检查在限流外执行
  const submissions = getAll(`SELECT * FROM game4_submissions WHERE group_id = ${groupId}`);
  if (submissions.length >= 3) {
    return res.status(400).json({ error: '已用完所有机会（3次）' });
  }

  try {
    const result = await runWithQueue(async () => {
      const aiCfg = getAIConfig();

      // Step 1: 用 qwen3.6-plus 理解线稿内容，生成描述 prompt
      const understandRes = await fetch(`${aiCfg.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiCfg.apiKey}`
        },
        body: JSON.stringify({
          model: aiCfg.aiModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '看这幅线稿。1.用一句短英文描述内容(用于AI绘图)。2.根据画功给5-10分(5涂鸭,7有趣,9卓越)。\n只回JSON:{"prompt":"英文描述","score":数字,"description":"中文简评"}'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageData }
                }
              ]
            }
          ],
          max_tokens: 150
        })
      });

      const understandData = await understandRes.json();
      const content = understandData.choices?.[0]?.message?.content || '';

      let prompt = 'A beautiful realistic photo based on a hand-drawn sketch';
      let score = 7;
      let description = '手绘作品';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          prompt = parsed.prompt || prompt;
          score = parseInt(parsed.score) || 7;
          score = Math.max(5, Math.min(10, score));
          description = parsed.description || '手绘作品';
        }
      } catch (e) {
        const scoreMatch = content.match(/(\d+)\s*分/);
        if (scoreMatch) score = Math.max(5, Math.min(10, parseInt(scoreMatch[1])));
      }

      // Step 2: 用 qwen-image-2.0-pro 生成图片
      let generatedImageUrl = null;
      try {
        // 增强 prompt 以确保生成写实照片
        const enhancedPrompt = `Realistic photo, high quality, detailed: ${prompt}. No sketches, no line art, pure photographic style.`;
        generatedImageUrl = await generateImageWithDashScope(aiCfg, enhancedPrompt);
        console.log(`[Game4] Group ${groupId}: image generated successfully`);
      } catch (imgErr) {
        console.error(`[Game4] Image generation failed for group ${groupId}:`, imgErr.message);
        // 图片生成失败不影响评分，继续
      }

      return { prompt, score, description, generatedImageUrl };
    });

    // AI 完成后执行文件保存和 DB 写入
    const currentSubmissions = getAll(`SELECT * FROM game4_submissions WHERE group_id = ${groupId}`);
    if (currentSubmissions.length >= 3) {
      return res.status(400).json({ error: '已用完所有机会（3次）' });
    }
    const attemptNum = currentSubmissions.length + 1;

    const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    // 保存原始线稿
    const sketchFilename = `sketch_g${groupId}_a${attemptNum}_${Date.now()}.png`;
    const sketchBase64 = imageData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(uploadsDir, sketchFilename), Buffer.from(sketchBase64, 'base64'));

    // 下载并保存生成的图片
    let generatedFilename = null;
    let generatedImageDataUrl = null;
    if (result.generatedImageUrl) {
      try {
        generatedFilename = `generated_g${groupId}_a${attemptNum}_${Date.now()}.png`;
        generatedImageDataUrl = await downloadImageToLocal(
          result.generatedImageUrl,
          path.join(uploadsDir, generatedFilename)
        );
      } catch (dlErr) {
        console.error(`[Game4] Failed to download generated image:`, dlErr.message);
        generatedFilename = null;
      }
    }

    runQuery(
      `INSERT INTO game4_submissions (group_id, attempt_number, sketch_path, generated_path, score, submitted_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [groupId, attemptNum, sketchFilename, generatedFilename || '', result.score]
    );

    const io = req.app.get('io');
    io.emit('submission-update', { gameId: 'game4', groupId: parseInt(groupId) });

    res.json({
      success: true,
      generatedImage: generatedImageDataUrl || null,
      description: result.description,
      score: result.score,
      attemptNumber: attemptNum,
      attemptsRemaining: 3 - attemptNum,
      message: generatedImageDataUrl
        ? `AI评价：${result.description}\n创意评分：${result.score}分！剩余${3 - attemptNum}次机会`
        : `AI评价：${result.description}\n创意评分：${result.score}分！（图片生成失败）剩余${3 - attemptNum}次机会`
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
