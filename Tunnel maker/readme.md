# Runnyvision Tunnel Maker

A deployable version of Runnyvision Tunnel Maker, split into maintainable frontend/backend files.

## Features included

- Local project persistence with IndexedDB
- Recent projects list and crash/reload recovery
- Library images stored outside session JSON
- URL import with optional backend proxy (`/api/proxy-image`)
- Upload-only mode toggle for strict reliability
- Undo/redo history
- Keyboard shortcuts
- Multi-select layers, duplicate, lock, bring front/back
- JSON schema versioning and migration (`schemaVersion: 2`)
- Validation and toast-based error feedback
- Export options:
  - MP4 export via server-side transcode endpoint
  - WebM export
  - PNG image-sequence ZIP export
  - Quality presets and export progress/cancel UI
- Dedicated project manager panel:
  - Open / rename / duplicate / delete projects
  - Create new project and refresh index
- About/help modal and splash screen
- Basic unit tests for core save/load/render math helpers

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Render deployment

This repo includes `render.yaml`.

- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node 20+

## Shortcuts

- `Space`: Play/Pause
- `Delete`/`Backspace`: Delete selected layer(s)
- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Shift + Z`: Redo
- `Ctrl/Cmd + D`: Duplicate selected layer(s)

## Notes

- Session JSON intentionally does not include image binary payloads.
- Imported/uploaded images are persisted in browser IndexedDB.
- If URL import fails due to upstream restrictions, keep proxy on or use upload-only mode.
