#!/bin/bash
set -e
WORKSPACE="/workspaces/run"

echo "🚀 Creating all files..."
# 1. buildStamp.ts
cat > "$WORKSPACE/rv-app/src/buildStamp.ts" << 'EOF'
export const BUILD_STAMP = {
  builtAt: new Date().toISOString(),
  commit: process.env.GIT_COMMIT || 'dev',
};
EOF
# 2. start-backend.js
cat > "$WORKSPACE/start-backend.js" << 'EOF'
#!/usr/bin/env node
const { spawn } = require('child_process');
const mode = process.argv[2] || 'api';
const backends = {
  api: { cmd: 'npx', args: ['ts-node', 'src/server.ts'], port: 3001, name: 'RV API (canonical)' },
  legacy: { cmd: 'node', args: ['backend/server.js'], port: 4000, name: 'Legacy Noodle Backend' },
};
const config = backends[mode];
if (!config) { console.error('Unknown mode: ' + mode); process.exit(1); }
console.log('Starting ' + config.name + ' on port ' + config.port + '...');
const proc = spawn(config.cmd, config.args, { stdio: 'inherit' });
proc.on('exit', (code) => process.exit(code || 0));
EOF
chmod +x "$WORKSPACE/start-backend.js"
# 3. b2Adapter.ts
mkdir -p "$WORKSPACE/src/adapters"
cat > "$WORKSPACE/src/adapters/b2Adapter.ts" << 'EOF'
export interface B2Config { keyId?: string; applicationKey?: string; bucketName?: string; }
export class B2Adapter {
  constructor(private config: B2Config) {}
  async listClips(): Promise<any[]> { console.warn('[B2] Adapter disabled'); return []; }
  async getManifest(videoId: string): Promise<any> { return { video_id: videoId, chunks: [], total_duration: 0 }; }
  async uploadFile(path: string, data: Buffer): Promise<string> { return 'mock-file-id'; }
}
export const b2 = new B2Adapter({ keyId: process.env.B2_KEY_ID, applicationKey: process.env.B2_APP_KEY, bucketName: process.env.B2_BUCKET });
EOF

# 4. architecture.md
mkdir -p "$WORKSPACE/docs"
echo "# RunnyVision Architecture - See full version in repo" > "$WORKSPACE/docs/architecture.md"

# 5. Cleanup
[ -d "$WORKSPACE/runnyvision" ] && rm -rf "$WORKSPACE/runnyvision" && echo "Deleted: runnyvision/"
[ -d "$WORKSPACE/googlefit-bridge" ] && rm -rf "$WORKSPACE/googlefit-bridge" && echo "Deleted: googlefit-bridge/"

echo "✅ Done! Files created: buildStamp.ts, start-backend.js, b2Adapter.ts, architecture.md"
