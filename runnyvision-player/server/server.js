const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'web', 'viewer')));

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    service: 'runnyvision-player signaling server'
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const SIGNAL_TYPES = new Set(['offer', 'answer', 'candidate']);

wss.on('connection', (socket) => {
  const existingPeers = [...wss.clients].filter((client) => client !== socket).length;

  socket.send(
    JSON.stringify({
      type: 'welcome',
      existingPeers
    })
  );

  socket.on('message', (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      console.warn('Ignoring invalid JSON signaling message.');
      return;
    }

    if (!message || !SIGNAL_TYPES.has(message.type)) {
      return;
    }

    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client !== socket && client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`RunnyVision server running at http://localhost:${PORT}`);
});
