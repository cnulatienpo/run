/**
 * ============================================================
 *  ELECTRON SHELL – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - Bootstraps the Electron window
 *    - Loads renderer/index.html using loadFile(...)
 *    - Uses preload.js for secure bridging
 *    - Runs with contextIsolation:true and nodeIntegration:false
 *
 *  Related paths:
 *    /renderer/index.html     → HUD + overlay
 *    /renderer/renderer.js    → HUD logic
 *    /preload.js              → safe IPC bridge
 *
 *  Notes:
 *    - This file is the root of the Electron app.
 *    - Do not add backend logic here.
 *    - App navigation must happen in renderer, not here.
 * ============================================================
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const AutoLaunch = require('auto-launch');

const appLauncher = new AutoLaunch({ name: 'Run The World' });

const backendPath = path.join(process.resourcesPath || __dirname, 'src', 'server.js');
const backend = spawn(process.execPath, [backendPath], {
  stdio: 'inherit',
});

backend.on('close', (code) => {
  console.log('Backend exited with code', code);
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(process.resourcesPath, 'renderer', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:3000/renderer/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  appLauncher.enable().catch((err) => {
    console.error('Auto-launch failed:', err);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
