# RunnyVision – Developer Guide

## Canonical video player rule
- `simple-player/index.html` is the one and only active video player in this repo.
- `dev/hud-dev-server.js` is the one and only dev-server entrypoint for video-player work.
- Do not create, duplicate, fork, or revive another player for zoom, portrait, transitions, stretch, or dev-panel work.
- All video-player feature work must modify `simple-player/` in place.

## ONLY PLAYER
- `simple-player/index.html`

## Dev Setup
- **Player:** `npm run start:browser` (Express dev server @3000 serving `simple-player/index.html` with /api proxy)
- **RV API (canonical backend):** `npx ts-node src/server.ts` (port 3001)
- **Legacy backend:** `node backend/server.js` (port 4000; only needed for streaming ingest)
- **rv-app static preview:** `npx tsc -p rv-app && http-server rv-app/public -p 4173`

## Ports
- Player: 3000
- RV API: 3001
- Legacy: 4000
- rv-app: 4173 (optional dev serve)

## Backend unification
The RV API on **port 3001** is the canonical backend. `backend/server.js` is a legacy ingest service—only run it when you specifically need streaming ingest or SSE playback. For standard development, rely on `src/server.ts` exclusively.

## Proxying
The active player calls to `/api/*` are automatically proxied to `http://localhost:3001` by the Express dev server. No browser CORS errors should occur when using `npm run start:browser`.

## Electron packaging
The packaged Electron app serves the active player and rv-app assets from the `app://` custom protocol, keeping both surfaces on a single origin.

# Quick Verification Steps

These steps verify that the active player, rv-app, and RV API are built and serve correctly.

### 1. Build rv-app


npx tsc -p rv-app

Output goes to:


rv-app/public/build/


### 2. Serve rv-app
Use any static server, e.g.:


npx http-server rv-app/public -p 4173

Visit:


http://localhost:4173

You should see:
  • Prep Studio  
  • Run  
  • Library  
  • Settings  
And the service worker should register (check DevTools console).

### 3. Start the RV API


npx ts-node src/server.ts

Listens at:


http://localhost:3001


### 4. Serve the player
Recommended (proxy-capable):


node dev/hud-dev-server.js

Then open:
  • /simple-player/index.html

### 5. End-to-End Check
  • simple-player loads at http://localhost:3000/simple-player/index.html  
  • rv-app loads at http://localhost:4173  
  • RV API answers at http://localhost:3001/api/health  

If all three load without console errors, wiring is correct.
