import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 180 * 1024 * 1024 }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(rootDir));
app.use('/vendor/jszip', express.static(
  path.join(__dirname, 'node_modules/jszip/dist')
));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'runnyvision-tunnel-maker', version: '1.2.0', transcode: Boolean(ffmpegPath) });
});

async function runFfmpeg(args) {
  const exe = process.env.FFMPEG_PATH || ffmpegPath;
  if (!exe) throw new Error('FFmpeg executable not available.');

  await new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `FFmpeg exited with code ${code}`));
    });
  });
}

app.get('/api/proxy-image', async (req, res) => {
  const target = req.query.url;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ error: 'Missing url query parameter.' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).json({ error: 'Invalid URL.' });
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).json({ error: 'Only http/https URLs are supported.' });
    return;
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'runnyvision-tunnel-maker-proxy/1.0'
      }
    });

    if (!response.ok) {
      res.status(502).json({ error: `Upstream returned ${response.status}.` });
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'Upstream resource is not an image.' });
      return;
    }

    const buf = Buffer.from(await response.arrayBuffer());
    const maxBytes = 30 * 1024 * 1024;
    if (buf.length > maxBytes) {
      res.status(413).json({ error: 'Image exceeds 30 MB limit.' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch {
    res.status(502).json({ error: 'Failed to fetch upstream image.' });
  }
});

app.post('/api/transcode/mp4', upload.single('video'), async (req, res) => {
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: 'Missing video upload.' });
    return;
  }

  const exe = process.env.FFMPEG_PATH || ffmpegPath;
  if (!exe) {
    res.status(501).json({ error: 'MP4 transcoding is not available on this host.' });
    return;
  }

  const base = `runnyvision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(os.tmpdir(), `${base}.webm`);
  const outputPath = path.join(os.tmpdir(), `${base}.mp4`);

  try {
    await fs.writeFile(inputPath, req.file.buffer);

    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      outputPath
    ]);

    const out = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.mp4"`);
    res.send(out);
  } catch (err) {
    res.status(500).json({ error: `Transcode failed: ${err.message || 'unknown error'}` });
  } finally {
    await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Runnyvision Tunnel Maker running on port ${port}`);
});
