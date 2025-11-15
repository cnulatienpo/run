/**
 * Environment loader that respects both .env and .env.local files when
 * running in development mode. Production deployments maintain the
 * default behaviour of only loading the shared .env file.
 */

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

let loaded = false;

/**
 * Loads environment variables from .env and .env.local (if present).
 * Subsequent invocations are no-ops to prevent repeated work.
 */
export function loadEnv() {
  if (loaded) {
    return;
  }

  const configDir = path.dirname(fileURLToPath(new URL('../server.js', import.meta.url)));
  const envPath = path.join(configDir, '.env');
  dotenv.config({ path: envPath });

  if (process.env.NODE_ENV !== 'production') {
    const localEnvPath = path.join(configDir, '.env.local');
    if (existsSync(localEnvPath)) {
      dotenv.config({ path: localEnvPath, override: true });
    }
  }

  loaded = true;
}
