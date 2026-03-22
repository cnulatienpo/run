const express = require('express');
const path = require('path');

const app = express();
const rootDir = path.resolve(__dirname, '..');
const port = 5173;

app.use(express.static(rootDir, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  },
}));

app.get('/', (_req, res) => {
  res.redirect('/simple-player/index.html');
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Simple player server running at http://127.0.0.1:${port}/simple-player/index.html`);
});
