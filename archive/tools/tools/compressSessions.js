#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';
import process from 'process';
import { tmpdir } from 'os';
import tar from 'tar';

import { loadEnv } from '../config/loadEnv.js';
import { getArchivesDir, getGhostsDir, getSnapshotsDir } from '../utils/paths.js';
import { uploadBufferToB2 } from '../uploadToB2.js';
import { logInfo } from '../log.js';

loadEnv();

function parseArgs(argv) {
  const args = { source: 'snapshots', dryRun: false };
  argv.slice(2).forEach((arg, index, array) => {
    if (arg === '--month') {
      args.month = array[index + 1];
    }
    if (arg === '--source') {
      args.source = array[index + 1];
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
    }
  });
  return args;
}

function resolveSourceDir(source) {
  if (source === 'ghosts') {
    return getGhostsDir();
  }
  return getSnapshotsDir();
}

async function collectFiles(sourceDir, month) {
  const entries = [];
  let directories = [];
  try {
    directories = await readdir(sourceDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return entries;
    }
    throw error;
  }
  for (const dir of directories) {
    if (month && !dir.startsWith(month)) {
      continue;
    }
    const folderPath = path.join(sourceDir, dir);
    let files = [];
    try {
      files = await readdir(folderPath);
    } catch (error) {
      continue;
    }
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        continue;
      }
      entries.push({
        absPath: filePath,
        relPath: path.join(dir, file),
        size: stats.size,
      });
    }
  }
  return entries;
}

async function createArchive(sourceDir, files, archiveName) {
  const tmpPath = path.join(tmpdir(), `${archiveName}-${Date.now()}.tar.gz`);
  const relativePaths = files.map((file) => file.relPath);
  await tar.create({ gzip: true, cwd: sourceDir, file: tmpPath }, relativePaths);
  return tmpPath;
}

async function ensureArchiveDir() {
  const dir = getArchivesDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.month || !/^[0-9]{4}-[0-9]{2}$/.test(options.month)) {
    console.error('compressSessions requires --month in YYYY-MM format');
    process.exit(1);
  }
  const sourceDir = resolveSourceDir(options.source);
  const files = await collectFiles(sourceDir, options.month);
  if (files.length === 0) {
    console.error('No files found for the requested month.');
    process.exit(1);
  }

  const archiveName = `${options.source}-${options.month}`;
  const archivePath = await createArchive(sourceDir, files, archiveName);
  const archiveBuffer = await readFile(archivePath);

  const manifest = {
    month: options.month,
    source: options.source,
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.size, 0),
    files: files.map((file) => ({ path: file.relPath, size: file.size })),
    generated_at: new Date().toISOString(),
  };
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

  const archiveDir = await ensureArchiveDir();
  const localArchive = path.join(archiveDir, `${archiveName}.tar.gz`);
  const localManifest = path.join(archiveDir, `${archiveName}.manifest.json`);
  await writeFile(localArchive, archiveBuffer);
  await writeFile(localManifest, manifestBuffer);

  if (options.dryRun) {
    logInfo('ARCHIVE', 'Dry run complete', { archivePath: localArchive, manifestPath: localManifest });
    return;
  }

  const baseKey = `archive/${options.source}/${options.month}`;
  await uploadBufferToB2({
    buffer: archiveBuffer,
    fileName: `${baseKey}.tar.gz`,
    contentType: 'application/gzip',
    info: {
      source: options.source,
      month: options.month,
      files: String(files.length),
    },
  });
  await uploadBufferToB2({
    buffer: manifestBuffer,
    fileName: `${baseKey}.manifest.json`,
    contentType: 'application/json',
    info: {
      source: options.source,
      month: options.month,
      files: String(files.length),
    },
  });

  logInfo('ARCHIVE', 'Archive uploaded to Backblaze', {
    archiveKey: `${baseKey}.tar.gz`,
    manifestKey: `${baseKey}.manifest.json`,
    fileCount: files.length,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
