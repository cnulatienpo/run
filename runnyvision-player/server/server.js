const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = 3000;
const VALID_ROLES = new Set(['viewer', 'source']);
const VALID_MESSAGE_TYPES = new Set(['register', 'offer', 'answer', 'candidate', 'control', 'status']);

const app = express();
app.use(express.json());

const viewerPath = path.join(__dirname, '..', 'web', 'viewer');
app.use('/web/viewer', express.static(viewerPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(viewerPath, 'index.html'));
});

const state = {
  viewers: new Set(),
  sourceClientId: null
};

app.get('/status', (req, res) => {
  res.json({
    running: true,
    connectedViewers: state.viewers.size,
    sourceConnected: Boolean(state.sourceClientId)
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clientCounter = 0;
const clients = new Map();

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function relayToViewers(message, excludeClientId = null) {
  for (const viewerId of state.viewers) {
    if (viewerId === excludeClientId) {
      continue;
    }

    const viewer = clients.get(viewerId);
    if (viewer) {
      sendJson(viewer.socket, message);
    }
  }
}

function relayToSource(message) {
  if (!state.sourceClientId) {
    return;
  }

  const source = clients.get(state.sourceClientId);
  if (source) {
    sendJson(source.socket, message);
  }
}

function normalizeRelayMessage(rawMessage, fromRole) {
  const toRole = rawMessage.to || (fromRole === 'source' ? 'viewer' : 'source');
  return {
    type: rawMessage.type,
    from: fromRole,
    to: toRole,
    payload: rawMessage.payload || {}
  };
}

function unregisterClient(clientId) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }

  if (client.role === 'viewer') {
    state.viewers.delete(clientId);
  }

  if (client.role === 'source' && state.sourceClientId === clientId) {
    state.sourceClientId = null;
  }

  clients.delete(clientId);
}

wss.on('connection', (socket) => {
  const clientId = `client_${++clientCounter}`;
  clients.set(clientId, { socket, role: null });

  sendJson(socket, {
    type: 'status',
    payload: {
      message: 'connected',
      clientId
    }
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      sendJson(socket, {
        type: 'status',
        payload: { level: 'error', message: 'invalid_json' }
      });
      return;
    }

    if (!message || typeof message !== 'object' || !VALID_MESSAGE_TYPES.has(message.type)) {
      sendJson(socket, {
        type: 'status',
        payload: { level: 'error', message: 'invalid_message_type' }
      });
      return;
    }

    const client = clients.get(clientId);
    if (!client) {
      return;
    }

    if (message.type === 'register') {
      if (!VALID_ROLES.has(message.role)) {
        sendJson(socket, {
          type: 'status',
          payload: { level: 'error', message: 'invalid_role' }
        });
        return;
      }

      client.role = message.role;
      if (client.role === 'viewer') {
        state.viewers.add(clientId);
      }

      if (client.role === 'source') {
        if (state.sourceClientId && state.sourceClientId !== clientId) {
          const oldSource = clients.get(state.sourceClientId);
          if (oldSource) {
            sendJson(oldSource.socket, {
              type: 'status',
              from: 'server',
              to: 'source',
              payload: { level: 'warning', message: 'source_replaced' }
            });
          }
        }
        state.sourceClientId = clientId;
      }

      sendJson(socket, {
        type: 'status',
        from: 'server',
        to: client.role,
        payload: {
          level: 'info',
          message: 'registered',
          role: client.role,
          clientId
        }
      });
      return;
    }

    if (!client.role) {
      sendJson(socket, {
        type: 'status',
        payload: { level: 'error', message: 'register_required' }
      });
      return;
    }

    const relayMessage = normalizeRelayMessage(message, client.role);

    if (client.role === 'source' && relayMessage.to === 'viewer') {
      relayToViewers(relayMessage);
      return;
    }

    if (client.role === 'viewer' && relayMessage.to === 'source') {
      relayToSource(relayMessage);
      return;
    }

    sendJson(socket, {
      type: 'status',
      payload: { level: 'error', message: 'incompatible_route' }
    });
  });

  socket.on('close', () => {
    unregisterClient(clientId);
  });
});

server.listen(PORT, () => {
  console.log(`RunnyVision signaling server running at http://localhost:${PORT}`);
});
