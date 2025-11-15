import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(new URL('./paths.js', import.meta.url)));
const backendRoot = path.resolve(currentDir, '..');

export function getBackendRoot() {
  return backendRoot;
}

export function resolveBackendPath(...segments) {
  return path.join(backendRoot, ...segments);
}

export function getSnapshotsDir() {
  return resolveBackendPath('snapshots');
}

export function getGhostsDir() {
  return resolveBackendPath('ghosts');
}

export function getLogsDir() {
  return resolveBackendPath('logs');
}

export function getArchivesDir() {
  return resolveBackendPath('archive');
}
