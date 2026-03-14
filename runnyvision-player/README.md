# runnyvision-player

A signaling-first WebRTC viewer stack for:

**TouchDesigner source peer ↔ Node signaling server ↔ browser viewer peer**

## Architecture (no media gateway)

This repository now uses direct peer-to-peer media between TouchDesigner and the browser viewer.

- **TouchDesigner** (future `role: "source"`) creates/sends WebRTC offers and publishes video from a TOP output.
- **Node server** handles static file hosting, WebSocket signaling relay, and status/control message routing only.
- **Browser viewer** (`role: "viewer"`) receives offers, returns answers, exchanges ICE candidates, and renders incoming video in Three.js.

The Node process does **not** process or forward media tracks.

## Folder structure

```text
runnyvision-player/
├── td/                        # Future TouchDesigner files (.toe/.tox), not implemented here
├── web/
│   └── viewer/
│       ├── index.html
│       ├── style.css
│       └── viewer.js          # Viewer role peer + Three.js video display
├── server/
│   └── server.js              # Express hosting + WebSocket signaling relay
├── config/
│   ├── signaling.example.json # Roles/message types contract for signaling
│   └── stream.json
└── README.md
```

## Install and run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the signaling server:

   ```bash
   node server/server.js
   ```

3. Open the viewer:

   ```text
   http://localhost:3000
   ```

## Signaling contract

All signaling messages are JSON. The canonical relay shape is:

```json
{
  "type": "offer",
  "from": "source",
  "to": "viewer",
  "payload": { "type": "offer", "sdp": "..." }
}
```

Supported message types:

- `register`
- `offer`
- `answer`
- `candidate`
- `control`
- `status`

Routing rules:

- `source` → all connected `viewer` clients
- `viewer` → current `source` client

## Browser viewer behavior

On page load the viewer:

1. Connects to the WebSocket server.
2. Registers with:

   ```json
   { "type": "register", "role": "viewer" }
   ```

3. Creates an `RTCPeerConnection` in recv-only mode.
4. Waits for a source `offer`.
5. On `offer`, sets remote description, creates an `answer`, sets local description, sends `answer`.
6. Exchanges ICE candidates through signaling.
7. Keeps an animated placeholder shader active until a remote stream arrives.
8. When a stream arrives, attaches it to `#streamVideo` and maps a `THREE.VideoTexture` to the full-screen plane.

## Connecting TouchDesigner as the source peer

TouchDesigner is expected to act as `role: "source"` and use its built-in WebRTC support.

### Expected signaling flow

1. **TouchDesigner connects to the signaling server** (`ws://<host>:3000`).
2. **TouchDesigner registers**:

   ```json
   {
     "type": "register",
     "role": "source"
   }
   ```

3. **TouchDesigner creates a WebRTC offer** using **WebRTC DAT**.
4. **TouchDesigner sends the offer JSON** through the signaling server:

   ```json
   {
     "type": "offer",
     "from": "source",
     "to": "viewer",
     "payload": {
       "type": "offer",
       "sdp": "..."
     }
   }
   ```

5. **Browser viewer receives the offer and returns an answer**:

   ```json
   {
     "type": "answer",
     "from": "viewer",
     "to": "source",
     "payload": {
       "type": "answer",
       "sdp": "..."
     }
   }
   ```

6. **ICE candidates are exchanged** via signaling messages (`type: "candidate"`).
7. **TouchDesigner video is published via Video Stream Out TOP** and tied to the WebRTC peer once negotiation succeeds.

### TouchDesigner video source guidance

The outgoing TouchDesigner source can be driven from a final TOP such as:

- **Render TOP**
- **Composite TOP**
- a final processed TOP used for tunnel/player output

### TouchDesigner connection options to signaling

This server is generic WebSocket signaling, so TouchDesigner can connect by using:

- **Web Client DAT**
- **WebSocket DAT** (or equivalent supported websocket client approach)
- a small external helper script if your project setup requires it

## Server status endpoint

`GET /status` returns runtime server state:

- `running`
- `connectedViewers`
- `sourceConnected`
