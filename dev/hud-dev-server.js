// dev/hud-dev-server.js
// ============================================================
// DEV HALLWAY — ONE DOOR ONLY
//
// CANONICAL PLAYER: simple-player/index.html
// DO NOT change WEB_ROOT to any other directory.
// DO NOT add fallback candidates.
// All other players are archived under archive/players/.
// ============================================================

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = 3000;
const RV_BACKEND_TARGET = process.env.API_TARGET || 'http://localhost:3001';

// HARD-CODED. No fallback, no auto-detection, no override.
const WEB_ROOT = path.join(__dirname, '..', 'simple-player');

if (!fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
  throw new Error(
    'FATAL: simple-player/index.html not found.\n' +
    'The canonical player is missing. Do NOT create a new player.\n' +
    'Restore simple-player/index.html from git history.'
  );
}

// Disable all caching in development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Disable all caching in development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve canonical player (simple-player) — the ONLY player
app.use(express.static(WEB_ROOT));

// Serve video clip libraries required by simple-player
app.use('/grey',  express.static(path.join(__dirname, '..', 'grey')));
app.use('/clown', express.static(path.join(__dirname, '..', 'clown')));

// Serve shared assets
app.use('/assets',   express.static(path.join(__dirname, '..', 'assets')));
app.use('/testsongs', express.static(path.join(__dirname, '..', 'testsongs')));

// Proxy /api → RV API backend (port 3001)
app.use('/api', (req, res, next) => {
  req.url = '/api' + req.url;
  next();
}, createProxyMiddleware({
  target: RV_BACKEND_TARGET,
  changeOrigin: true,
  ws: true,
}));

// Proxy /rv → backend
app.use('/rv', createProxyMiddleware({
  target: RV_BACKEND_TARGET,
  changeOrigin: true,
  ws: true,
  logLevel: 'warn',
}));

// All unmatched routes return the canonical player index — no fallback to other HTML
app.get('*', (_req, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================================');
  console.log(`ACTIVE PLAYER: simple-player/index.html`);
  console.log(`URL:           http://localhost:${PORT}`);
  console.log(`Root:          ${WEB_ROOT}`);
  console.log('=================================================');
});
