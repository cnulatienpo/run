const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const { MediaGateway } = require('./mediaGateway');

function startSignaling(server, options = {}) {
  const wss = new WebSocketServer({ server });
  const clients = new Map();
  let idCounter = 0;

  const gateway = new MediaGateway({
    sendToClient: (clientId, payload) => {
      const socket = clients.get(clientId)?.socket;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    },
    maxViewers: options.maxViewers,
    testVideoPath: path.join(__dirname, '..', 'video', 'sample')
  });

  wss.on('connection', (socket) => {
    const clientId = `peer_${++idCounter}`;
    clients.set(clientId, { socket, role: 'unknown' });

    socket.send(
      JSON.stringify({
        type: 'welcome',
        clientId
      })
    );

    socket.on('message', async (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', reason: 'invalid_json' }));
        return;
      }

      const client = clients.get(clientId);
      if (!client) {
        return;
      }

      if (message.type === 'register') {
        if (message.role !== 'viewer' && message.role !== 'source') {
          socket.send(JSON.stringify({ type: 'error', reason: 'invalid_role' }));
          return;
        }

        client.role = message.role;
        await gateway.handleRegister({ clientId, role: client.role });
        socket.send(JSON.stringify({ type: 'registered', clientId, role: client.role }));
        return;
      }

      await gateway.handleSignal({
        clientId,
        role: client.role,
        message
      });
    });

    socket.on('close', async () => {
      clients.delete(clientId);
      await gateway.disconnectClient(clientId);
    });
  });

  gateway.maybeStartTestMode();

  return { wss, gateway };
}

module.exports = { startSignaling };
