require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { initDB } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Proxy for Google GenAI API (allows access from mainland China)
app.use('/api/gemini-proxy', createProxyMiddleware({
  target: 'https://generativelanguage.googleapis.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/gemini-proxy': '', 
  },
  onProxyReq: (proxyReq, req, res) => {
    // Optionally log or modify headers if needed
  }
}));



// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));
app.use('/videos', express.static(path.join(__dirname, 'data', 'videos'), { maxAge: '1d' }));
app.use('/faces', express.static(path.join(__dirname, 'data', 'faces')));

// Ensure directories exist
const dirs = [
  path.join(__dirname, 'data'),
  path.join(__dirname, 'data', 'uploads'),
  path.join(__dirname, 'data', 'videos'),
  path.join(__dirname, 'data', 'faces'),
  path.join(__dirname, 'data', 'faces', 'real'),
  path.join(__dirname, 'data', 'faces', 'fake'),
];
dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Start server
async function start() {
  await initDB();

  // Import routes
  const authRoutes = require('./routes/auth');
  const adminRoutes = require('./routes/admin');
  const game1Routes = require('./routes/game1');
  const game2Routes = require('./routes/game2');
  const game3Routes = require('./routes/game3');
  const game4Routes = require('./routes/game4');

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/game1', game1Routes);
  app.use('/api/game2', game2Routes);
  app.use('/api/game3', game3Routes);
  app.use('/api/game4', game4Routes);

  // Socket.IO handler
  const socketHandler = require('./socket/handler');
  socketHandler(io);

  // Make io accessible to routes
  app.set('io', io);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║   AI Challenge Competition Server        ║
    ║   Running on http://localhost:${PORT}       ║
    ║   Admin: http://localhost:${PORT}/admin     ║
    ╚══════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);

module.exports = { app, io };
