#!/usr/bin/env node
/**
 * Timeline visualiser for noodle sessions. Renders a terminal table and can
 * export the processed data as CSV for further analysis.
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import process from 'process';

import { extractTimelinePoints } from '../utils/timeline.js';
import { logError, logInfo } from '../log.js';

function parseArgs(argv) {
  const options = {
    highlightDrift: false,
    collapsePauses: false,
    syntheticOnly: false,
    exportPath: undefined,
    positional: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--highlight-drift') {
      options.highlightDrift = true;
    } else if (token === '--collapse-pauses') {
      options.collapsePauses = true;
    } else if (token === '--synthetic-only') {
      options.syntheticOnly = true;
    } else if (token.startsWith('--export=')) {
      options.exportPath = token.split('=')[1];
    } else if (token === '--export') {
      options.exportPath = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--')) {
      console.warn(`Unknown flag: ${token}`);
    } else {
      options.positional.push(token);
    }
  }
  return options;
}

async function loadSessions(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.sessions)) {
      return parsed.sessions;
    }
    return [parsed];
  }
  throw new Error('Unsupported timeline payload format');
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return '';
  }
  return Number(value).toFixed(digits);
}

function buildRows(points, { highlightDrift, collapsePauses }) {
  const rows = [];
  let lastSpeed;
  let previousWasPause = false;
  points.forEach((point) => {
    const speed = Number.isFinite(point.speed) ? point.speed : undefined;
    const cadence = Number.isFinite(point.cadence) ? point.cadence : undefined;
    const heart = Number.isFinite(point.heart_bpm) ? point.heart_bpm : undefined;
    const stride = Number.isFinite(point.stride_length) ? point.stride_length : undefined;
    const timeSeconds = point.t_ms / 1000;

    const noteParts = [];
    if (point.note) {
      noteParts.push(point.note);
    }
    if (highlightDrift && speed !== undefined && lastSpeed !== undefined) {
      const delta = speed - lastSpeed;
      if (Math.abs(delta) >= 0.5) {
        noteParts.push(`[drift Δ=${delta.toFixed(2)}]`);
      }
    }
    if (cadence !== undefined) {
      noteParts.push(`cadence=${cadence.toFixed(1)}`);
    }

    const isPause = speed === undefined || Math.abs(speed) < 0.05;
    if (collapsePauses && isPause) {
      if (previousWasPause) {
        lastSpeed = speed;
        return;
      }
      noteParts.push('[pause]');
      previousWasPause = true;
    } else {
      previousWasPause = false;
    }

    rows.push({
      t_ms: point.t_ms,
      timeSeconds,
      speed,
      heart,
      stride_length: stride,
      cadence,
      note: noteParts.join(' '),
    });
    lastSpeed = speed !== undefined ? speed : lastSpeed;
  });
  return rows;
}

function printRows(sessionLabel, rows) {
  if (!rows.length) {
    console.log(`${sessionLabel}: no timeline data available.`);
    return;
  }
  const header = ['Time (s)', 'Speed', 'Heart BPM', 'Stride Len', 'Notes'];
  const separators = header.map((title) => '-'.repeat(Math.max(title.length, 10)));
  console.log(`${sessionLabel}`);
  console.log(`${header[0].padStart(8)} | ${header[1].padStart(6)} | ${header[2].padStart(9)} | ${header[3].padStart(10)} | ${header[4]}`);
  console.log(`${separators[0].padStart(8)}-+-${separators[1].padStart(6)}-+-${separators[2].padStart(9)}-+-${separators[3].padStart(10)}-+-${'-'.repeat(20)}`);
  rows.forEach((row) => {
    console.log(
      `${formatNumber(row.timeSeconds, 1).padStart(8)} | ${formatNumber(row.speed, 2).padStart(6)} | ${formatNumber(row.heart, 0).padStart(9)} | ${formatNumber(row.stride_length, 2).padStart(10)} | ${row.note}`,
    );
  });
  console.log('');
}

async function exportCsv(exportPath, rows) {
  if (!exportPath) {
    return;
  }
  const absolute = path.isAbsolute(exportPath) ? exportPath : path.resolve(process.cwd(), exportPath);
  const lines = ['t_ms,speed,cadence,stride_length,note'];
  rows.forEach((row) => {
    const parts = [
      row.t_ms,
      row.speed ?? '',
      row.cadence ?? '',
      row.stride_length ?? '',
      row.note ? `"${row.note.replace(/"/g, '""')}"` : '',
    ];
    lines.push(parts.join(','));
  });
  await writeFile(absolute, `${lines.join('\n')}\n`);
  logInfo('CLI', 'Timeline exported to CSV', { exportPath: absolute });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = options.positional[0];
  if (!filePath) {
    console.error('Usage: node cli/showTimeline.js <noodle.json> [--synthetic-only] [--highlight-drift] [--collapse-pauses] [--export <file>]');
    process.exitCode = 1;
    return;
  }

  try {
    const sessions = await loadSessions(filePath);
    const filtered = options.syntheticOnly
      ? sessions.filter((session) => session.synthetic === true || session.synthetic_flag === true)
      : sessions;
    if (!filtered.length) {
      console.log('No sessions to display.');
      return;
    }
    for (let i = 0; i < filtered.length; i += 1) {
      const session = filtered[i];
      const points = extractTimelinePoints(session);
      const rows = buildRows(points, options);
      const label = filtered.length > 1
        ? `Session ${i + 1} (${session.sessionId ?? session.session_id ?? 'unknown'})`
        : `Session (${session.sessionId ?? session.session_id ?? 'unknown'})`;
      printRows(label, rows);
      if (options.exportPath) {
        let exportLabel = options.exportPath;
        if (filtered.length > 1) {
          exportLabel = options.exportPath.replace(/(\.csv)?$/i, `-${i + 1}$1`);
        }
        await exportCsv(exportLabel, rows);
      }
    }
  } catch (error) {
    logError('CLI', 'Failed to render timeline', { message: error.message });
    process.exitCode = 1;
  }
}

run();
