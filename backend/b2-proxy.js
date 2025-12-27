import https from 'https';
import { B2_ENABLED } from './b2-config.js';

let authToken = null;
let authExpiry = 0;

export async function proxyB2Request(path) {
  if (!B2_ENABLED) {
    return {
      error: 'B2 disabled',
      path,
      stub: true
    };
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.backblazeb2.com',
        path,
        method: 'GET',
        timeout: 5000
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('B2 timeout'));
    });

    req.on('error', reject);
    req.end();
  });
}
