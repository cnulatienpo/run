# runnyvision-player

A starter repository for a future real-time running video system:

**TouchDesigner → WebRTC stream → Node signaling server → WebGL browser viewer**

This first step provides only the initial folder layout, a basic Three.js viewer, and a minimal Node/Express server.

## Folder structure

```text
runnyvision-player/
├── td/                 # Future TouchDesigner .toe/.tox files
├── web/
│   └── viewer/         # Browser WebGL viewer
│       ├── index.html
│       ├── style.css
│       └── viewer.js
├── server/             # Node signaling server placeholder
│   └── server.js
├── config/             # Future playlists/transitions/settings
├── video/
│   └── sample/         # Development sample video files
└── README.md
```

## Run the server

1. From the `runnyvision-player` directory, install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   node server/server.js
   ```

3. Open the viewer:

   ```text
   http://localhost:3000
   ```

## Current viewer behavior

- Full-screen WebGL canvas rendered with Three.js.
- Animated shader background placeholder (no stream required).
- Hidden `<video id="streamVideo">` element reserved for future WebRTC media.
- `attachVideoStream(videoElement)` helper in `viewer.js` to make future video-texture wiring straightforward.

## Future TouchDesigner connection

Later, TouchDesigner will publish a video stream over WebRTC and connect through the Node signaling layer (`server/`).
The browser viewer (`web/viewer/`) will use that stream as a live `THREE.VideoTexture` source.
