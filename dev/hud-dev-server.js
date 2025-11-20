#!/usr/bin/env node
/**
 * HUD DEV SERVER
 * ----------------------------------------------
 * Serves renderer/ assets with an /api proxy to
 * the RV backend (defaults to http://localhost:3001).
 *
 * Usage:
 *   API_PORT=3001 HUD_PORT=3000 node dev/hud-dev-server.js
 *   API_TARGET=http://localhost:5555 node dev/hud-dev-server.js
 *
 * Notes:
 *   - Keeps HUD static (no bundler), but enables local
 *     API calls without needing CORS on the backend.
 *   - Only proxies /api; other requests are served from
 *     renderer/ directly.
 */

const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const HUD_PORT = Number(process.env.HUD_PORT) || 3000;
const API_PORT = Number(process.env.API_PORT) || 3001;
const API_TARGET = process.env.API_TARGET || `http://localhost:${API_PORT}`;

const app = express();
const rendererDir = path.resolve(__dirname, '..', 'renderer');

app.use(
  '/api',
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    logLevel: 'warn',
  }),
);

app.use(express.static(rendererDir));

app.listen(HUD_PORT, () => {
  console.log(`HUD dev server listening on http://localhost:${HUD_PORT}`);
  console.log(`Proxying /api -> ${API_TARGET}`);
  console.log(`Serving static files from ${rendererDir}`);
});
