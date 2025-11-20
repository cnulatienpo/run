const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

// Serve renderer/ statically
app.use(express.static(path.join(__dirname, '..', 'renderer')));

// Proxy /api → RV API (port 3001)
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  ws: true,
}));

// Fallback to HUD index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'renderer', 'index.html'));
});

app.listen(PORT, () =>
  console.log(`HUD dev server running at http://localhost:${PORT}`)
);
