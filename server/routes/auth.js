const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getAll, getOne, runQuery, getConfig, saveDB } = require('../db');

// Login - group selection
router.post('/login', (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: '请输入组号' });

  const groupCount = parseInt(getConfig('group_count'));
  if (groupId < 1 || groupId > groupCount) {
    return res.status(400).json({ error: `组号必须在 1-${groupCount} 之间` });
  }

  const group = getOne(`SELECT * FROM groups WHERE id = ${groupId}`);
  if (!group) return res.status(404).json({ error: '组号不存在' });

  // Check if another device is online
  if (group.is_online && group.session_token) {
    return res.status(409).json({ 
      error: '该组号已有设备在线',
      conflict: true,
      groupId 
    });
  }

  // Generate new session
  const token = uuidv4();
  runQuery(`UPDATE groups SET session_token = '${token}', is_online = 1, last_login = datetime('now') WHERE id = ${groupId}`);

  res.json({ 
    success: true, 
    token, 
    groupId,
    message: `第 ${groupId} 组登录成功` 
  });
});

// Force login - kick existing device
router.post('/force-login', (req, res) => {
  const { groupId } = req.body;
  const io = req.app.get('io');

  const group = getOne(`SELECT * FROM groups WHERE id = ${groupId}`);
  if (group && group.socket_id) {
    // Notify old device
    io.to(group.socket_id).emit('force-logout', { message: '另一台设备已登录此组号，您已被强制下线' });
  }

  const token = uuidv4();
  runQuery(`UPDATE groups SET session_token = '${token}', is_online = 1, socket_id = NULL, last_login = datetime('now') WHERE id = ${groupId}`);

  res.json({ success: true, token, groupId });
});

// Logout
router.post('/logout', (req, res) => {
  const { groupId, token } = req.body;
  const group = getOne(`SELECT * FROM groups WHERE id = ${groupId}`);
  if (group && group.session_token === token) {
    runQuery(`UPDATE groups SET session_token = NULL, socket_id = NULL, is_online = 0 WHERE id = ${groupId}`);
  }
  res.json({ success: true });
});

// Verify session
router.post('/verify', (req, res) => {
  const { groupId, token } = req.body;
  const group = getOne(`SELECT * FROM groups WHERE id = ${groupId}`);
  if (group && group.session_token === token) {
    res.json({ valid: true, groupId });
  } else {
    res.json({ valid: false });
  }
});

// Get group count
router.get('/group-count', (req, res) => {
  const count = getConfig('group_count');
  res.json({ count: parseInt(count) });
});

// Get extensions status (public)
router.get('/extensions-status', (req, res) => {
  const enabled = getConfig('extensions_enabled');
  res.json({ enabled: enabled === '1' });
});

module.exports = router;
