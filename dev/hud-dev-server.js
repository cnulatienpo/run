const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
// DEV ONLY — intentionally inert unless started manually.

const PORT = 3000;
const RV_BACKEND_TARGET = process.env.API_TARGET || 'http://localhost:3001';

// Disable all caching in development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve renderer/ statically
app.use(express.static(path.join(__dirname, '..', 'renderer')));
// Serve shared assets (font + frame artwork)
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Serve testsongs directory for music files
app.use('/testsongs', express.static(path.join(__dirname, '..', 'testsongs')));
// Proxy /api → RV API (port 3001)
app.use('/api', createProxyMiddleware({
  target: RV_BACKEND_TARGET,
  changeOrigin: true,
  ws: true,
}));

// Proxy /rv → backend (canonical UI host)
app.use('/rv', createProxyMiddleware({
  target: RV_BACKEND_TARGET,
  changeOrigin: true,
  ws: true,
  logLevel: 'warn',
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
