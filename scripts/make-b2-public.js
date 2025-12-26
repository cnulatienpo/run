#!/usr/bin/env node

/**
 * Make Backblaze B2 files publicly accessible
 * This allows the RunnyVision player to access footage without authentication
 */

const https = require('https');

const KEY_ID = '00553905d4063760000000003';
const APP_KEY = 'K005LowTRmnx/iVJgMox6tH2gLDl3b8';
const BUCKET_NAME = 'RunnyVisionSourceVideos';

async function authorizeAccount() {
  return new Promise((resolve, reject) => {
    const authString = Buffer.from(`${KEY_ID}:${APP_KEY}`).toString('base64');
    
    const options = {
      hostname: 'api.backblazeb2.com',
      path: '/b2api/v2/b2_authorize_account',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Authorization failed: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function updateBucketInfo(authData, bucketId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      accountId: authData.accountId,
      bucketId: bucketId,
      bucketInfo: {
        // Add CORS rules to allow browser access
      },
      bucketType: 'allPublic', // Make bucket public
      lifecycleRules: []
    });

    const options = {
      hostname: new URL(authData.apiUrl).hostname,
      path: '/b2api/v2/b2_update_bucket',
      method: 'POST',
      headers: {
        'Authorization': authData.authorizationToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Update failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getBucketId(authData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      accountId: authData.accountId,
      bucketName: BUCKET_NAME
    });

    const options = {
      hostname: new URL(authData.apiUrl).hostname,
      path: '/b2api/v2/b2_list_buckets',
      method: 'POST',
      headers: {
        'Authorization': authData.authorizationToken,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          const bucket = result.buckets.find(b => b.bucketName === BUCKET_NAME);
          resolve(bucket ? bucket.bucketId : null);
        } else {
          reject(new Error(`List buckets failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    console.log('Authorizing with B2...');
    const authData = await authorizeAccount();
    console.log('✓ Authorized');

    console.log(`Looking for bucket: ${BUCKET_NAME}...`);
    const bucketId = await getBucketId(authData);
    
    if (!bucketId) {
      console.error(`✗ Bucket "${BUCKET_NAME}" not found`);
      process.exit(1);
    }
    
    console.log(`✓ Found bucket: ${bucketId}`);

    console.log('Making bucket public...');
    await updateBucketInfo(authData, bucketId);
    console.log('✓ Bucket is now public!');
    
    console.log('\nYou can now access files at:');
    console.log(`https://f005.backblazeb2.com/file/${BUCKET_NAME}/`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
