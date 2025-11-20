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
