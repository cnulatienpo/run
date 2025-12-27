# RunnyVision Architecture

## Overview
RunnyVision is an Electron app with multiple frontends and a TypeScript API backend.

## Directory Structure
#!/bin/bash
# create-all.sh - Creates all missing files and performs cleanup

set -e  # Exit on error

WORKSPACE="/workspaces/run"

echo "🚀 Creating all files..."

# 1. Create buildStamp.ts
echo "📝 Creating rv-app/src/buildStamp.ts..."
cat > "$WORKSPACE/rv-app/src/buildStamp.ts" << 'EOF'
export const BUILD_STAMP = {
  builtAt: new Date().toISOString(),
  commit: process.env.GIT_COMMIT || 'dev',
};
