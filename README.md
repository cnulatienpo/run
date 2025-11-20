# Run The World – Developer Guide

## Dev Setup
- **HUD (renderer):** `npm run start:browser` (Express dev server @3000 with /api proxy)
- **RV API (canonical backend):** `npx ts-node src/server.ts` (port 3001)
- **Legacy backend:** `node backend/server.js` (port 4000; only needed for streaming ingest)
- **rv-app static preview:** `npx tsc -p rv-app && http-server rv-app/public -p 4173`

## Ports
- HUD: 3000
- RV API: 3001
- Legacy: 4000
- rv-app: 4173 (optional dev serve)

## Backend unification
The RV API on **port 3001** is the canonical backend. `backend/server.js` is a legacy ingest service—only run it when you specifically need streaming ingest or SSE playback. For standard development, rely on `src/server.ts` exclusively.

## Proxying
HUD calls to `/api/*` are automatically proxied to `http://localhost:3001` by the Express dev server. No browser CORS errors should occur when using `npm run start:browser`.

## Electron packaging
The packaged Electron app serves HUD and rv-app assets from the `app://` custom protocol, keeping both surfaces on a single origin.

# Quick Verification Steps

These steps verify that all components (HUD, rv-app, RV API) are built and serve correctly.

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


### 4. Serve the HUD
Recommended (proxy-capable):


node dev/hud-dev-server.js

Temporary (not recommended):


python3 -m http.server 3000

Then open:
  • /index.html (modern HUD), or  
  • /renderer/index.html (legacy HUD)

### 5. End-to-End Check
  • HUD loads at http://localhost:3000  
  • rv-app loads at http://localhost:4173  
  • RV API answers at http://localhost:3001/api/health  

If all three load without console errors, wiring is correct.
