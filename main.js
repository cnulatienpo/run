const { app, BrowserWindow } = require('electron');
const path = require('path');
const AutoLaunch = require('electron-launcher');

const appLauncher = new AutoLaunch({ name: 'Run The World' });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  appLauncher.enable().catch((err) => {
    console.error('Auto-launch failed:', err);
  });

  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
