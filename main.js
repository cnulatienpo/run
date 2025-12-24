/**
 * ============================================================
 *  ELECTRON SHELL – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - Bootstraps the Electron window
 *    - Loads renderer/index.html using loadURL(app://...)
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

/**
 * DEV NOTE:
 * Electron does NOT automatically launch either backend.
 * Developer must choose between RV API (3001) or legacy backend (4000).
 */
const { app, BrowserWindow, protocol } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const AutoLaunch = require('electron-launcher');

const appLauncher = new AutoLaunch({ name: 'RunnyVision' });

const backendPath = path.join(process.resourcesPath || __dirname, 'src', 'server.js');
const backend = spawn(process.execPath, [backendPath], {
  stdio: 'inherit',
});

backend.on('close', (code) => {
  console.log('Backend exited with code', code);
});

function registerAppProtocol() {
  const rendererRoot = path.join(__dirname, 'renderer');
  const rvAppRoot = path.join(__dirname, 'rv-app', 'public');
  const assetsRoot = path.join(__dirname, 'assets');
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const targetPath = path.normalize(path.join(__dirname, pathname));
    const isAllowed = [rendererRoot, rvAppRoot, assetsRoot].some((root) =>
      targetPath.startsWith(root)
    );
    const safePath = isAllowed ? targetPath : path.join(rendererRoot, 'index.html');
    callback({ path: safePath });
  });
}

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

  if (app.isPackaged) {
    win.loadFile(path.join(process.resourcesPath, 'renderer', 'index.html'));
  } else {
    win.loadURL('http://localhost:3000/renderer/index.html');
  }
}

app.whenReady().then(() => {
  appLauncher.enable().catch((err) => {
    console.error('Auto-launch failed:', err);
  });

  registerAppProtocol();
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
