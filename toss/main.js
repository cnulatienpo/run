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
const fs = require('fs');
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
  const baseRoot = app.isPackaged ? process.resourcesPath : __dirname;
  const rendererRoot = path.join(baseRoot, 'renderer');
  const rvAppRoot = path.join(baseRoot, 'rv-app', 'public');
  const assetsRoot = path.join(baseRoot, 'assets');

  /**
   * DEV/PROD ASSERTION:
   * Route all app:// requests to packaged static assets so /assets (font/frame)
   * and /rv resolve correctly when the HUD loads from file://.
   */
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname.replace(/^\//, '');
    const targetRoot = relativePath === 'rv' || relativePath.startsWith('rv/')
      ? rvAppRoot
      : relativePath === 'assets' || relativePath.startsWith('assets/')
        ? assetsRoot
        : rendererRoot;
    let subPath = relativePath;
    if (relativePath.startsWith('rv/')) {
      subPath = relativePath.slice(3);
    } else if (relativePath === 'rv') {
      subPath = '';
    } else if (relativePath.startsWith('assets/')) {
      subPath = relativePath.slice(7);
    } else if (relativePath === 'assets') {
      subPath = '';
    } else if (relativePath.startsWith('renderer/')) {
      subPath = relativePath.slice('renderer/'.length);
    } else if (relativePath === 'renderer') {
      subPath = '';
    }

    const targetPath = path.normalize(path.join(targetRoot, subPath));
    const isAllowed = [rendererRoot, rvAppRoot, assetsRoot].some((root) => targetPath.startsWith(root));
    let safePath = isAllowed ? targetPath : path.join(rendererRoot, 'index.html');

    if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
      safePath = path.join(safePath, 'index.html');
    }

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
    win.loadURL('app://renderer/index.html');
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
