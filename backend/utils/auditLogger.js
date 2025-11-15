import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

import { getLogsDir } from './paths.js';

const AUDIT_FILE = path.join(getLogsDir(), 'audit.log');
let initialised = false;

async function ensureAuditFile() {
  if (initialised) {
    return;
  }
  await mkdir(getLogsDir(), { recursive: true });
  await appendFile(AUDIT_FILE, '');
  initialised = true;
}

function formatAuditEntry(tag, message) {
  const timestamp = new Date().toISOString();
  return `${timestamp} ${tag} ${message}\n`;
}

export async function logAudit(tag, message) {
  await ensureAuditFile();
  const entry = formatAuditEntry(`[${tag}]`, message);
  await appendFile(AUDIT_FILE, entry);
}

export function getAuditLogPath() {
  return AUDIT_FILE;
}
