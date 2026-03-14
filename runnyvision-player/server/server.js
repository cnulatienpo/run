const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'web', 'viewer')));

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    service: 'runnyvision-player signaling server',
    stage: 'skeleton'
  });
});

app.post('/playlist', (req, res) => {
  res.json({
    ok: true,
    message: 'Playlist endpoint placeholder.',
    received: req.body || null
  });
});

app.listen(PORT, () => {
  console.log(`RunnyVision server running at http://localhost:${PORT}`);
});
