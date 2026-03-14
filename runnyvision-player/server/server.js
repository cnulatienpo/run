const express = require('express');
const http = require('http');
const path = require('path');
const streamConfig = require('../config/stream.json');
const { startSignaling } = require('./signaling');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'web', 'viewer')));
app.use('/video', express.static(path.join(__dirname, '..', 'video')));

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    service: 'runnyvision-player signaling server',
    stream: streamConfig
  });
});

const server = http.createServer(app);
startSignaling(server, { maxViewers: streamConfig.maxViewers });

server.listen(PORT, () => {
  console.log(`RunnyVision server running at http://localhost:${PORT}`);
});
