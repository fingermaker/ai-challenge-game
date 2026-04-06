const { getOne, runQuery } = require('../db');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Register group association
    socket.on('register-group', ({ groupId, token }) => {
      const group = getOne(`SELECT * FROM groups WHERE id = ${groupId}`);
      if (group && group.session_token === token) {
        socket.groupId = groupId;
        socket.join(`group-${groupId}`);
        runQuery(`UPDATE groups SET socket_id = '${socket.id}', is_online = 1 WHERE id = ${groupId}`);
        
        // Notify admin
        io.emit('group-status-change', { groupId, online: true });
        console.log(`Group ${groupId} registered with socket ${socket.id}`);
      }
    });

    // Admin joins admin room
    socket.on('join-admin', () => {
      socket.join('admin');
      console.log('Admin connected');
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.groupId) {
        runQuery(`UPDATE groups SET socket_id = NULL, is_online = 0 WHERE id = ${socket.groupId} AND socket_id = '${socket.id}'`);
        io.emit('group-status-change', { groupId: socket.groupId, online: false });
        console.log(`Group ${socket.groupId} disconnected`);
      }
    });

    // Ping to keep alive
    socket.on('ping-alive', ({ groupId }) => {
      if (groupId) {
        runQuery(`UPDATE groups SET is_online = 1 WHERE id = ${groupId}`);
      }
    });
  });
};
