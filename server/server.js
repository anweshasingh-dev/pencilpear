const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable CORS for all Express HTTP routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// In-memory room store:
// roomId -> { text: string, strokes: Array, createdAt: number }
const rooms = new Map();

// Generate short, unique 6-character room code (e.g. A7K3P9)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous 0, O, 1, I
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log('[Socket] socket connected, ID:', socket.id);

  // 1. Create Room
  socket.on('create-room', (callback) => {
    const roomId = generateRoomCode();
    rooms.set(roomId, {
      text: '',
      strokes: [],
      createdAt: Date.now()
    });

    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }

    socket.join(roomId);
    socket.currentRoom = roomId;

    console.log('[Room] room created:', roomId, 'by socket:', socket.id);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        boardState: {
          text: '',
          strokes: []
        }
      });
    }
  });

  // 2. Join Room
  socket.on('join-room', (roomIdInput, callback) => {
    const roomId = (roomIdInput || '').trim().toUpperCase();

    if (!roomId || !rooms.has(roomId)) {
      console.log(`[Room] join failed: room "${roomId}" does not exist`);
      if (typeof callback === 'function') {
        callback({
          success: false,
          message: 'Room not found'
        });
      }
      return;
    }

    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }

    socket.join(roomId);
    socket.currentRoom = roomId;

    const roomData = rooms.get(roomId);
    console.log('[Room] room joined:', roomId, 'by socket:', socket.id);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        boardState: {
          text: roomData.text || '',
          strokes: roomData.strokes || []
        }
      });
    }
  });

  // 3. Drawing Segment Broadcast (Pen and Eraser)
  // Scoped strictly to the specific room, excluding sender to prevent duplicate drawing
  socket.on('draw-segment', ({ roomId, segment }) => {
    if (!roomId || !rooms.has(roomId)) return;
    if (socket.currentRoom !== roomId) return;

    socket.to(roomId).emit('draw-segment', segment);
  });

  // 4. Completed Stroke History (Persists in room memory for new joiners)
  socket.on('stroke-complete', ({ roomId, stroke }) => {
    if (!roomId || !rooms.has(roomId)) return;
    if (socket.currentRoom !== roomId) return;

    const roomData = rooms.get(roomId);
    if (roomData && stroke) {
      roomData.strokes.push(stroke);
    }
  });

  // 5. Shared Text Synchronization
  socket.on('text-update', ({ roomId, text }) => {
    if (!roomId || !rooms.has(roomId)) return;
    if (socket.currentRoom !== roomId) return;

    rooms.get(roomId).text = text;
    socket.to(roomId).emit('text-updated', { text });
  });

  // 6. Board Clear Synchronization
  socket.on('clear-board', ({ roomId }) => {
    if (!roomId || !rooms.has(roomId)) return;
    if (socket.currentRoom !== roomId) return;

    rooms.get(roomId).strokes = [];
    socket.to(roomId).emit('board-cleared');
    console.log(`[Board] board cleared in room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] socket disconnected, ID:', socket.id);
  });
});

let isRunning = false;

// Function to start server programmatically (from Electron) or standalone
function startServer(port = PORT, callback) {
  if (isRunning) {
    if (callback) callback(null, server, true);
    return server;
  }

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Server] Port ${port} is already in use; attaching to existing running server.`);
      isRunning = false;
      if (callback) callback(null, server, true);
    } else {
      console.error('[Server] Server error:', err);
      if (callback) callback(err);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    isRunning = true;
    console.log(`SharedBoard server running at http://localhost:${port}`);
    if (callback) callback(null, server, false);
  });

  return server;
}

// Function to stop server cleanly
function stopServer(callback) {
  if (isRunning) {
    server.close(() => {
      isRunning = false;
      console.log('[Server] SharedBoard server stopped cleanly.');
      if (callback) callback();
    });
  } else if (callback) {
    callback();
  }
}

// If executed directly with 'node server/server.js', start standalone server
if (require.main === module) {
  startServer(PORT);
}

module.exports = { startServer, stopServer, server, io, app };
