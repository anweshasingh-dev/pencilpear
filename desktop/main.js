const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer, stopServer } = require('../server/server');

let mainWindow = null;
let serverStartedByElectron = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 580,
    minWidth: 320,
    minHeight: 420,
    title: 'SharedBoard',
    backgroundColor: '#ece6dc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the web app served by local server, with fallback to local file
  mainWindow.loadURL('http://localhost:3000').catch((err) => {
    console.warn('[Desktop] Could not load via HTTP, loading local file:', err.message);
    mainWindow.loadFile(path.join(__dirname, '../client/index.html'));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Automatically start Node / Socket.IO server on port 3000 if not already running
  startServer(3000, (err, serverInstance, alreadyRunning) => {
    if (err) {
      console.error('[Desktop] Failed to start server:', err);
    }
    serverStartedByElectron = !alreadyRunning;

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
});

// Clean shutdown: shut down internal server when Electron app is closed
app.on('before-quit', () => {
  if (serverStartedByElectron) {
    stopServer();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
