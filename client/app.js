// SharedBoard - Client Application Logic (Realtime Synchronization)

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const roomCodeInput = document.getElementById('room-code-input');
const roomFeedback = document.getElementById('room-feedback');

const stationeryButtons = document.querySelectorAll('.stationery-btn[data-tool]');
const stationeryTray = document.getElementById('stationery-tray');
const colorPaletteGroup = document.getElementById('color-palette-group');
const inkSwatches = document.querySelectorAll('.ink-swatch');
const sizeButtons = document.querySelectorAll('.size-dot-btn');
const btnClear = document.getElementById('btn-clear-board');

const boardArea = document.getElementById('shared-board-area');
const boardTextArea = document.getElementById('board-text-input');
const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');

// Application State
let currentRoom = null;
let activeTool = 'text'; // 'text' | 'pen' | 'eraser'
let currentColor = '#1f1f1f'; // Default Black
let currentSizeKey = 'medium'; // 'small' | 'medium' | 'large'

// Nib & Eraser Size Definitions
const PEN_SIZES = {
  small: 2,
  medium: 4,
  large: 7
};

const ERASER_SIZES = {
  small: 8,
  medium: 15,
  large: 25
};

// Pointer State for Canvas
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentStroke = null;

// Status Indicator: 'online' (🟢), 'connecting' (🟡), 'offline' (🔴)
function updateConnectionStatus(state, label) {
  statusIndicator.className = `status-indicator ${state}`;
  statusText.textContent = label;
}

// Show room feedback note
function showFeedback(message, isSuccess = false) {
  roomFeedback.textContent = message;
  roomFeedback.className = isSuccess ? 'room-feedback success' : 'room-feedback';
  roomFeedback.classList.remove('hidden');

  if (isSuccess) {
    setTimeout(() => {
      roomFeedback.classList.add('hidden');
    }, 3500);
  }
}

function hideFeedback() {
  roomFeedback.classList.add('hidden');
}

// Determine target socket host (browser origin or localhost:3000 for Electron file://)
const SOCKET_URL = (typeof window !== 'undefined' && window.location.protocol.startsWith('http'))
  ? window.location.origin
  : 'http://localhost:3000';

let socket = null;

function initSocket() {
  if (typeof io === 'undefined') {
    console.error(
      '[Socket] "io" is undefined. Ensure Socket.IO client script is loaded.'
    );
    updateConnectionStatus('offline', 'Offline');

    // Attempt retry if script was delayed
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        if (typeof io !== 'undefined' && !socket) {
          initSocket();
        }
      }, { once: true });
    }
    return;
  }

  updateConnectionStatus('connecting', 'Connecting...');

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[Socket] socket connected, ID:', socket.id);
    if (currentRoom) {
      // Re-join active room if connection dropped and recovered
      socket.emit('join-room', currentRoom, (response) => {
        if (response && response.success) {
          updateConnectionStatus('online', `Room: ${currentRoom}`);
        } else {
          updateConnectionStatus('online', 'Online');
        }
      });
    } else {
      updateConnectionStatus('online', 'Online');
    }
    hideFeedback();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] socket disconnected. Reason:', reason);
    updateConnectionStatus('offline', 'Offline');
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] connection error:', error.message || error);
    updateConnectionStatus('offline', 'Offline');
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`[Socket] reconnect attempt #${attempt}`);
    updateConnectionStatus('connecting', 'Connecting...');
  });

  // --- Real-time Listeners from Room Peers ---

  // 1. Remote stroke segment received
  socket.on('draw-segment', (segment) => {
    console.log('[Drawing] stroke received:', segment);
    renderSegment(segment);
  });

  // 2. Remote text updated
  socket.on('text-updated', ({ text }) => {
    if (boardTextArea.value !== text) {
      const start = boardTextArea.selectionStart;
      const end = boardTextArea.selectionEnd;
      boardTextArea.value = text;
      if (document.activeElement === boardTextArea) {
        boardTextArea.setSelectionRange(start, end);
      }
    }
  });

  // 3. Remote board cleared
  socket.on('board-cleared', () => {
    console.log('[Board] board cleared by remote peer');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

// Start connection
initSocket();

// --- Room Management ---

// Create Room (🔗 Share)
btnCreateRoom.addEventListener('click', () => {
  hideFeedback();

  if (!socket || !socket.connected) {
    showFeedback('Server not reachable. Please ensure node server is running.');
    return;
  }

  socket.emit('create-room', (response) => {
    if (response && response.success) {
      currentRoom = response.roomId;
      roomCodeInput.value = response.roomId;
      updateConnectionStatus('online', `Room: ${currentRoom}`);
      console.log('[Room] room created:', response.roomId);
      showFeedback(`Room ${currentRoom} ready to share`, true);
      // Fresh room board
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      boardTextArea.value = '';
    } else {
      showFeedback('Unable to create room. Please try again.');
    }
  });
});

// Join Room (↪ Join)
btnJoinRoom.addEventListener('click', () => {
  hideFeedback();
  const enteredCode = roomCodeInput.value.trim().toUpperCase();

  if (!enteredCode) {
    showFeedback('Enter a room code to join.');
    return;
  }

  if (!socket || !socket.connected) {
    showFeedback('Server not reachable. Please ensure node server is running.');
    return;
  }

  socket.emit('join-room', enteredCode, (response) => {
    if (response && response.success) {
      currentRoom = response.roomId;
      roomCodeInput.value = response.roomId;
      updateConnectionStatus('online', `Room: ${currentRoom}`);
      console.log('[Room] room joined:', response.roomId);
      showFeedback(`Joined room ${currentRoom}`, true);

      // Restore board state from server
      if (response.boardState) {
        boardTextArea.value = response.boardState.text || '';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (Array.isArray(response.boardState.strokes)) {
          response.boardState.strokes.forEach((stroke) => {
            renderFullStroke(stroke);
          });
        }
      }
    } else {
      showFeedback(response?.message || 'Room not found');
    }
  });
});

// Press Enter to join
roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnJoinRoom.click();
  }
});

// --- Toolbar & Tool Selection ---

stationeryButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const selectedTool = btn.dataset.tool;
    setActiveTool(selectedTool);
  });
});

function setActiveTool(tool) {
  activeTool = tool;
  stationeryButtons.forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });

  if (tool === 'text') {
    stationeryTray.classList.add('hidden');
    boardArea.classList.remove('drawing-active', 'eraser-active');
    boardTextArea.placeholder = 'Start typing...';
    boardTextArea.focus();
  } else if (tool === 'pen') {
    stationeryTray.classList.remove('hidden');
    colorPaletteGroup.classList.remove('hidden');
    boardArea.classList.add('drawing-active');
    boardArea.classList.remove('eraser-active');
    boardTextArea.placeholder = '';
  } else if (tool === 'eraser') {
    stationeryTray.classList.remove('hidden');
    colorPaletteGroup.classList.add('hidden'); // Eraser only needs size selector
    boardArea.classList.add('drawing-active', 'eraser-active');
    boardTextArea.placeholder = '';
  }
}

// Color Swatch Selection
inkSwatches.forEach((swatch) => {
  swatch.addEventListener('click', () => {
    inkSwatches.forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
    currentColor = swatch.dataset.color;
  });
});

// Size Selection
sizeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    sizeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentSizeKey = btn.dataset.size;
  });
});

// --- Canvas Sizing & Natural Scaling ---

function initCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0);

      canvas.width = rect.width;
      canvas.height = rect.height;
      ctx.drawImage(tempCanvas, 0, 0);
    }
  }
}

window.addEventListener('resize', initCanvasSize);
setTimeout(initCanvasSize, 40);

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

// Pointer Drawing Events
canvas.addEventListener('pointerdown', (e) => {
  if (activeTool === 'text') return;

  canvas.setPointerCapture(e.pointerId);
  isDrawing = true;
  const { x, y } = getCanvasCoords(e);
  lastX = x;
  lastY = y;

  const size = activeTool === 'eraser' ? ERASER_SIZES[currentSizeKey] : PEN_SIZES[currentSizeKey];
  currentStroke = {
    tool: activeTool,
    color: currentColor,
    size: size,
    points: [{ x, y }]
  };

  const segment = {
    x0: x,
    y0: y,
    x1: x,
    y1: y,
    tool: activeTool,
    color: currentColor,
    size: size
  };

  // 1. Draw locally on canvas
  renderSegment(segment);

  // 2. Broadcast segment to other clients in room
  if (currentRoom && socket && socket.connected) {
    socket.emit('draw-segment', {
      roomId: currentRoom,
      segment: segment
    });
    console.log('[Drawing] stroke sent:', segment);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!isDrawing || activeTool === 'text') return;

  const { x, y } = getCanvasCoords(e);
  const size = activeTool === 'eraser' ? ERASER_SIZES[currentSizeKey] : PEN_SIZES[currentSizeKey];

  if (currentStroke) {
    currentStroke.points.push({ x, y });
  }

  const segment = {
    x0: lastX,
    y0: lastY,
    x1: x,
    y1: y,
    tool: activeTool,
    color: currentColor,
    size: size
  };

  // 1. Draw locally
  renderSegment(segment);

  // 2. Broadcast segment to other clients in room
  if (currentRoom && socket && socket.connected) {
    socket.emit('draw-segment', {
      roomId: currentRoom,
      segment: segment
    });
    console.log('[Drawing] stroke sent:', segment);
  }

  lastX = x;
  lastY = y;
});

function stopDrawing(e) {
  if (!isDrawing) return;
  isDrawing = false;
  if (e && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }

  // Save complete stroke in room history on the server
  if (currentRoom && socket && socket.connected && currentStroke) {
    socket.emit('stroke-complete', {
      roomId: currentRoom,
      stroke: currentStroke
    });
  }
  currentStroke = null;
}

canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// Render a single line segment
function renderSegment(segment) {
  ctx.save();
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = segment.size;

  if (segment.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = segment.color;
  }

  ctx.moveTo(segment.x0, segment.y0);
  ctx.lineTo(segment.x1, segment.y1);
  ctx.stroke();
  ctx.restore();
}

// Render an entire stroke from history
function renderFullStroke(stroke) {
  if (!stroke || !stroke.points || stroke.points.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.size;

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
  }

  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y);
  } else {
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

// Clear Board
btnClear.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (currentRoom && socket && socket.connected) {
    socket.emit('clear-board', { roomId: currentRoom });
  }
});

// Synchronize Shared Textarea Input
boardTextArea.addEventListener('input', () => {
  if (currentRoom && socket && socket.connected) {
    socket.emit('text-update', {
      roomId: currentRoom,
      text: boardTextArea.value
    });
  }
});

// --- Collaboration Popover UI Toggle ---
const collabTrigger = document.getElementById('collab-trigger');
const collabPopover = document.getElementById('collab-popover');

if (collabTrigger && collabPopover) {
  collabTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    collabPopover.classList.toggle('hidden');
    if (!collabPopover.classList.contains('hidden')) {
      roomCodeInput.focus();
    }
  });

  collabPopover.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (!collabPopover.contains(e.target) && e.target !== collabTrigger) {
      collabPopover.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !collabPopover.classList.contains('hidden')) {
      collabPopover.classList.add('hidden');
    }
  });
}
