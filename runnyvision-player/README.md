# runnyvision-player

A real-time WebRTC gateway prototype for:

**TouchDesigner → WebRTC media gateway → browser WebGL viewer**

## Folder structure

```text
runnyvision-player/
├── td/                 # Future TouchDesigner .toe/.tox files
├── web/
│   └── viewer/         # Browser WebGL viewer
│       ├── index.html
│       ├── style.css
│       └── viewer.js
├── server/
│   ├── server.js       # Express app + static hosting + signaling bootstrap
│   ├── signaling.js    # WebSocket signaling and client registration
│   └── mediaGateway.js # WebRTC gateway using wrtc
├── config/
│   └── stream.json     # Stream metadata and viewer limits
├── video/
│   └── sample/         # Development sample video assets
└── README.md
```

## Install and run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the service:

   ```bash
   node server/server.js
   ```

3. Open the viewer:

   ```text
   http://localhost:3000
   ```

## WebRTC roles

- `role: "source"` is the sender peer (TouchDesigner or test sender).
- `role: "viewer"` is the browser playback client.

The gateway receives one source stream and forwards the active video track to all connected viewers.

## TouchDesigner connection preparation

TouchDesigner should connect over WebSocket to the same host/port as the viewer server (default `ws://localhost:3000`) and then:

1. Send registration payload:

   ```json
   { "type": "register", "role": "source" }
   ```

2. Create a WebRTC `RTCPeerConnection` in TD.
3. Use a Render TOP or Composite TOP output as the video source and publish it as a WebRTC video track.
4. Send offer payload:

   ```json
   { "type": "offer", "offer": { "type": "offer", "sdp": "..." } }
   ```

5. Exchange ICE candidates using:

   ```json
   { "type": "candidate", "candidate": { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 } }
   ```

The gateway responds with `answer` and its own ICE `candidate` messages.

## Test mode (before TD is connected)

When no `source` is connected, `mediaGateway` automatically starts a synthetic test stream so viewers can still negotiate and render video.

- Place development media files in `video/sample/`.
- The gateway checks for this directory and logs test mode startup.
- Current implementation uses a generated test pattern via `wrtc.nonstandard.RTCVideoSource` (no extra decoder dependencies required).

## Browser sender option (manual test source)

You can publish a source stream from a browser by opening DevTools on any page and running a small WebSocket/WebRTC sender script that registers as `role: "source"` and sends webcam tracks. This allows validating gateway forwarding before TouchDesigner integration.

## Stream config

`config/stream.json` controls metadata and limits:

```json
{
  "streamName": "runnyvision_main",
  "maxViewers": 100,
  "resolution": "1920x1080",
  "fps": 60
}
```
