/**
 * B2 Proxy for RunnyVision atoms
 * Adds authentication to B2 requests since bucket is private
 */

import https from 'https';

const KEY_ID = '00553905d4063760000000003';
const APP_KEY = 'K005LowTRmnx/iVJgMox6tH2gLDl3b8';
const BUCKET_BASE = 'https://s3.us-east-005.backblazeb2.com/RunnyVisionSourceVideos';

let authToken = null;
let authExpiry = 0;

async function getAuthToken() {
  if (authToken && Date.now() < authExpiry) {
    return authToken;
  }

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
          const result = JSON.parse(data);
          authToken = result.authorizationToken;
          authExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours
          resolve(authToken);
        } else {
          reject(new Error(`Auth failed: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function proxyB2Request(path) {
  const token = await getAuthToken();
  const url = `${BUCKET_BASE}${path}`;
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'Authorization': token
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`B2 request failed: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

export { proxyB2Request, getAuthToken };
