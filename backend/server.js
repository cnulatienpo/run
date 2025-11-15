import 'dotenv/config';
import express from 'express';

import { logError, logInfo } from './log.js';
import { syntheticPass } from './syntheticPass.js';
import { uploadToB2 } from './uploadToB2.js';
import { listSupportedVersions, validateNoodle } from './schemas/index.js';
import { buildNoodle } from './utils/buildNoodle.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    supportedVersions: listSupportedVersions(),
  });
});

app.post('/upload', async (req, res) => {
  const versionTag = req.body?.schemaVersion ?? 'v1.0.0';
  const rawNoodle = req.body?.noodle ?? req.body;

  try {
    logInfo('UPLOAD', 'Received noodle upload request', { versionTag });
    const realNoodle = buildNoodle({ ...rawNoodle, version: 1, synthetic: false });
    validateNoodle(realNoodle, versionTag);

    const syntheticNoodle = syntheticPass(realNoodle);
    validateNoodle(syntheticNoodle, versionTag);

    const realResult = await uploadToB2(realNoodle, { synthetic: false });
    const syntheticResult = await uploadToB2(syntheticNoodle, { synthetic: true });

    res.status(201).json({
      status: 'uploaded',
      version: versionTag,
      real: realResult,
      synthetic: syntheticResult,
    });
  } catch (error) {
    logError('UPLOAD', 'Failed to upload noodle payload', {
      message: error.message,
      validationErrors: error.validationErrors,
    });

    const statusCode = error.validationErrors ? 400 : 500;
    res.status(statusCode).json({
      status: 'error',
      message: error.message,
      validationErrors: error.validationErrors ?? [],
    });
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  logInfo('SERVER', `Noodle backend listening on port ${port}`);
});
