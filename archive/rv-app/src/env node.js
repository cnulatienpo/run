#!/usr/bin/env node
/**
 * Backend Launcher
 * Usage: node start-backend.js [api|legacy]
 */

const { spawn } = require('child_process');

const mode = process.argv[2] || 'api';

const backends = {
  api: {
    cmd: 'npx',
    args: ['ts-node', 'src/server.ts'],
    port: 3001,
    name: 'RV API (canonical)',
  },
  legacy: {
    cmd: 'node',
    args: ['backend/server.js'],
    port: 4000,
    name: 'Legacy Noodle Backend',
  },
};

const config = backends[mode];
if (!config) {
  console.error(`Unknown mode: ${mode}`);
  console.error('Usage: node start-backend.js [api|legacy]');
  process.exit(1);
}

console.log(`Starting ${config.name} on port ${config.port}...`);
const proc = spawn(config.cmd, config.args, { stdio: 'inherit' });
proc.on('exit', (code) => process.exit(code || 0));