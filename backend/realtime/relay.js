import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { WebSocketServer } from 'ws';

import { logDebug, logError, logInfo, logWarn } from '../log.js';
import { logAudit } from '../utils/auditLogger.js';
import { getGhostsDir } from '../utils/paths.js';

const ROOM_INACTIVITY_MS = 5 * 60 * 1000;
const PING_LOG_WINDOW = 6;

const rooms = new Map();

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      clients: new Set(),
      lastEventTime: 0,
      createdAt: Date.now(),
      ghostEvents: [],
      cleanupTimer: null,
    });
  }
  return rooms.get(roomId);
}

function scheduleCleanup(room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
  }
  room.cleanupTimer = setTimeout(() => {
    closeRoom(room.id, 'timeout');
  }, ROOM_INACTIVITY_MS);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function persistGhost(room) {
  if (!room.ghostEvents.length) {
    return;
  }
  const start = room.ghostEvents[0]?.received_at ?? room.createdAt;
  const end = room.ghostEvents[room.ghostEvents.length - 1]?.received_at ?? Date.now();
  const dateSegment = new Date(start).toISOString().slice(0, 10);
  const folder = path.join(getGhostsDir(), dateSegment);
  await mkdir(folder, { recursive: true });
  const safeRoomId = room.id.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filePath = path.join(folder, `ghost_${safeRoomId}.json`);
  const payload = {
    room_id: room.id,
    created_at: new Date(room.createdAt).toISOString(),
    closed_at: new Date().toISOString(),
    duration_ms: end - start,
    events: room.ghostEvents,
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  const durationLabel = formatDuration(end - start);
  await logAudit('RELAY', `ghost recorded for room:${room.id} (duration: ${durationLabel})`);
  logInfo('RELAY', 'Persisted ghost recording', { roomId: room.id, filePath });
}

async function closeRoom(roomId, reason = 'shutdown') {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  rooms.delete(roomId);
  try {
    await persistGhost(room);
  } catch (error) {
    logError('RELAY', 'Failed to persist ghost recording', { roomId, message: error.message });
  }
  room.clients.forEach((client) => {
    try {
      client.socket.close(1000, reason);
    } catch (error) {
      logDebug('RELAY', 'Error closing client socket', { message: error.message });
    }
  });
}

function averagePing(client) {
  if (!client.pings || client.pings.length === 0) {
    return 0;
  }
  const total = client.pings.reduce((sum, value) => sum + value, 0);
  return Math.round(total / client.pings.length);
}

function broadcast(room, payload, exceptClient) {
  const message = JSON.stringify(payload);
  room.clients.forEach((client) => {
    if (client === exceptClient) {
      return;
    }
    try {
      client.socket.send(message);
    } catch (error) {
      logWarn('RELAY', 'Failed to broadcast event', { roomId: room.id, message: error.message });
    }
  });
}

function recordEvent(room, client, eventPayload) {
  const now = Date.now();
  room.lastEventTime = now;
  scheduleCleanup(room);
  const pingAverage = averagePing(client);
  const adjusted = { ...eventPayload };
  if (!Number.isFinite(adjusted.t_ms)) {
    adjusted.t_ms = now - room.createdAt;
  }
  if (pingAverage > 200) {
    const base = Number.isFinite(adjusted.t_ms) ? Number(adjusted.t_ms) : 0;
    adjusted.adjusted_t_ms = base + Math.round(pingAverage / 2);
  }
  room.ghostEvents.push({
    ...adjusted,
    received_at: now,
    sender_id: client.id,
    ping_avg_ms: pingAverage,
  });
  broadcast(room, { type: 'event', room_id: room.id, data: adjusted }, client);
}

function handlePing(client, payload = {}) {
  const sentAt = Number(payload?.sent_at ?? payload?.ts ?? payload?.timestamp ?? Date.now());
  const now = Date.now();
  const latency = Math.max(0, now - sentAt);
  client.pings.push(latency);
  if (client.pings.length > PING_LOG_WINDOW) {
    client.pings.shift();
  }
  client.socket.send(JSON.stringify({ type: 'pong', sent_at: sentAt, received_at: now }));
  logInfo('RELAY', 'Ping telemetry', { clientId: client.id, latency, average: averagePing(client) });
}

function ensureClientRoom(client, roomId) {
  if (!roomId) {
    throw new Error('Room identifier is required.');
  }
  if (client.room && client.room.id === roomId) {
    return client.room;
  }
  if (client.room) {
    client.room.clients.delete(client);
    if (client.room.clients.size === 0) {
      closeRoom(client.room.id, 'empty');
    }
  }
  const room = ensureRoom(roomId);
  room.clients.add(client);
  scheduleCleanup(room);
  client.room = room;
  logInfo('RELAY', 'Client joined room', { clientId: client.id, roomId });
  return room;
}

function parseIncomingMessage(message) {
  if (typeof message !== 'string') {
    return null;
  }
  try {
    return JSON.parse(message);
  } catch (error) {
    return null;
  }
}

function deriveInitialRoom(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('session_id')
      || url.searchParams.get('group_id')
      || url.searchParams.get('room');
  } catch (error) {
    return null;
  }
}

function createClient(socket) {
  return {
    id: `client-${Math.random().toString(36).slice(2, 10)}`,
    socket,
    pings: [],
    room: null,
  };
}

export function startRelayServer(httpServer, options = {}) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: options.path ?? '/relay',
  });

  wss.on('connection', (socket, req) => {
    const client = createClient(socket);
    const initialRoom = deriveInitialRoom(req);
    if (initialRoom) {
      try {
        ensureClientRoom(client, initialRoom);
      } catch (error) {
        logWarn('RELAY', 'Failed to join initial room', { message: error.message });
      }
    }

    socket.on('message', (data) => {
      const payload = parseIncomingMessage(data.toString());
      if (!payload) {
        logWarn('RELAY', 'Received invalid JSON payload');
        return;
      }
      if (payload.type === 'ping') {
        handlePing(client, payload);
        return;
      }
      if (payload.type === 'join') {
        try {
          ensureClientRoom(client, payload.room_id || payload.roomId || payload.session_id || payload.group_id);
        } catch (error) {
          logWarn('RELAY', 'Join request failed', { message: error.message });
        }
        return;
      }
      if (!client.room) {
        logWarn('RELAY', 'Ignoring event without room assignment', { clientId: client.id });
        return;
      }
      if (payload.type === 'event') {
        recordEvent(client.room, client, payload.data ?? {});
        return;
      }
      recordEvent(client.room, client, payload);
    });

    socket.on('close', () => {
      if (client.room) {
        client.room.clients.delete(client);
        if (client.room.clients.size === 0) {
          closeRoom(client.room.id, 'empty');
        }
      }
    });

    socket.on('error', (error) => {
      logDebug('RELAY', 'Client socket error', { message: error.message });
    });
  });

  logInfo('RELAY', 'Realtime relay server initialised');
  return wss;
}

export function getActiveRooms() {
  const entries = [];
  rooms.forEach((room) => {
    entries.push({
      room_id: room.id,
      user_count: room.clients.size,
      last_event_time: Math.floor((room.lastEventTime || room.createdAt) / 1000),
    });
  });
  return entries;
}
