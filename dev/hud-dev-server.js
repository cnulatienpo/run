// dev/hud-dev-server.js
// dev/hud-dev-server.js

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

const RV_BACKEND_TARGET = process.env.API_TARGET || 'http://localhost:3001';

// ROOT PLAYER
const WEB_ROOT = path.join(__dirname, '..', 'relay-player');

// 🔥 VERIFY PLAYER EXISTS
if (!fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
  throw new Error('relay-player/index.html missing');
}

// ==========================
// NO CACHE (DEV ONLY)
// ==========================
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ==========================
// 🔥 STATIC FILES FIRST (CRITICAL)
// ==========================

// serve EVERYTHING inside relay-player
app.use(express.static(WEB_ROOT));

// specifically expose assets folder (important)
app.use('/relay-player/assets', express.static(path.join(WEB_ROOT, 'assets')));

// also allow direct /assets if needed
app.use('/assets', express.static(path.join(WEB_ROOT, 'assets')));

// ==========================
// OTHER STATIC FOLDERS
// ==========================
app.use('/grey', express.static(path.join(__dirname, '..', 'grey')));
app.use('/clown', express.static(path.join(__dirname, '..', 'clown')));

// ==========================
// API PROXY
// ==========================
app.use('/api', createProxyMiddleware({
  target: RV_BACKEND_TARGET,
  changeOrigin: true
}));

// ==========================
// 🔥 SAFE CATCH-ALL (IMPORTANT)
// ==========================

app.get('*', (req, res) => {

  // 🛑 DO NOT hijack image requests
  if (
    req.path.endsWith('.png') ||
    req.path.endsWith('.jpg') ||
    req.path.endsWith('.jpeg') ||
    req.path.endsWith('.webm') ||
    req.path.endsWith('.mp4')
  ) {
    return res.status(404).send('Asset not found');
  }

  // everything else → index.html
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

// ==========================
// START SERVER
// ==========================
app.listen(PORT, () => {
  console.log('==============================');
  console.log('DEV SERVER RUNNING');
  console.log(`http://localhost:${PORT}`);
  console.log('==============================');
});
