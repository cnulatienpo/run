const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
// 🦇 DEV SANITY MODE: proxy RV from backend (3001)
// This makes port 3000 the ONLY door you ever use.

import { createProxyMiddleware } from 'http-proxy-middleware';

app.use(
  '/rv',
  createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
  })
);

const PORT = 3000;
const RV_BACKEND_TARGET = process.env.API_TARGET || 'http://localhost:3001';
const rvAppPath = path.join(__dirname, '..', 'rv-app', 'public');

// Disable all caching in development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

/**
 * ============================================================
 *  AUDIT: DEV SERVER WIRING
 * ------------------------------------------------------------
 *  Broken:
 *    - HUD dev server only served renderer/, so /assets (fonts,
 *      frames) 404'd and the Workahol button opened a blank tab
 *      because /rv was never reachable.
 *  Fixed:
 *    - Serve /assets so the global theme loads in dev.
 *    - Serve /rv directly from rv-app/public so the Workahol
 *      Enabler is reachable from the HUD button even without
 *      the backend running.
 *  Kept:
 *    - /api proxy to port 3001 remains unchanged.
 * ============================================================
 */

// Serve renderer/ statically
app.use(express.static(path.join(__dirname, '..', 'renderer')));
// Serve shared assets (font + frame artwork)
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Serve testsongs directory for music files
app.use('/testsongs', express.static(path.join(__dirname, '..', 'testsongs')));
// Serve runnyvision demo files
app.use('/runnyvision', express.static(path.join(__dirname, '..', 'runnyvision')));
// Serve rv-app directly so the Workahol button never lands on a blank page
app.use('/rv', express.static(rvAppPath));
app.get('/rv/*', (_req, res) => res.sendFile(path.join(rvAppPath, 'index.html')));

// Proxy /api → RV API (port 3001)
app.use('/api', createProxyMiddleware({
  target: RV_BACKEND_TARGET,
  changeOrigin: true,
  ws: true,
}));

// Fallback to HUD index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'renderer', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () =>
  console.log(`HUD dev server running at http://localhost:${PORT}`)
).on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
