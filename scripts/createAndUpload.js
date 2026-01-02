#!/usr/bin/env node

const { buildNoodle } = require('../src/buildNoodle');
const { syntheticPass } = require('../src/syntheticPass');
const { validateNoodle } = require('../src/validateNoodle');

async function getUploadToB2() {
  const mod = await import('../backend/uploadToB2.js');
  return mod.uploadToB2;
}

async function run() {
  try {
    const rawData = {
      userId: 'demo-user-001',
      metrics: {
        heartRate: 75,
        temperature: 36.6,
        steps: 1200,
      },
      events: [
        { time: '2025-11-15T08:00:00Z', eventType: 'start' },
        { time: '2025-11-15T08:30:00Z', eventType: 'milestone', value: 1000 },
      ],
      notes: 'Sample noodle session used for testing uploads.',
      sensitiveFields: ['heartRate'],
      exportApproved: false,
      trainingLabels: {
        mood: 'focused',
        intent: 'easy_run',
        motion_quality: 'flow',
        confidence_scores: {
          mood: 0.6,
          intent: 0.8,
        },
      },
    };

    const uploadToB2 = await getUploadToB2();
    const noodle = buildNoodle(rawData);
    validateNoodle(noodle);
    console.log('Real noodle object is valid. Uploading to Backblaze B2...');
    const cleanResult = await uploadToB2(noodle, { synthetic: false });
    console.log('Uploaded clean noodle:', cleanResult.fileName);

    const synthetic = syntheticPass(noodle);
    validateNoodle(synthetic);
    console.log('Synthetic noodle object is valid. Uploading to Backblaze B2...');
    const syntheticResult = await uploadToB2(synthetic, { synthetic: true });
    console.log('Uploaded synthetic noodle:', syntheticResult.fileName);

    console.log('Finished uploading clean and synthetic noodle files.');
  } catch (error) {
    console.error('Error creating or uploading noodle file:', error.message);
    if (error.validationErrors) {
      console.error('Validation details:', error.validationErrors);
    }
    process.exitCode = 1;
  }
}

run();
