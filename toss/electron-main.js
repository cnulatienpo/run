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

/**
 * PACKAGING WARNING:
 * rv-app is NOT shipped with electron-builder by default.
 * Must add rv-app/public/** to extraResources to expose /rv.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
