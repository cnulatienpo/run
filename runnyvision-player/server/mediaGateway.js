const path = require('path');
const fs = require('fs');
const wrtc = require('wrtc');

const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream } = wrtc;
const { RTCVideoSource, RTCVideoFrame } = wrtc.nonstandard;

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

class MediaGateway {
  constructor({ sendToClient, maxViewers = 100, testVideoPath = null } = {}) {
    this.sendToClient = sendToClient;
    this.maxViewers = maxViewers;
    this.testVideoPath = testVideoPath;

    this.sourceClientId = null;
    this.sourcePeer = null;
    this.sourceTrack = null;
    this.sourceStream = null;

    this.viewerPeers = new Map();

    this.testSource = null;
    this.testTrack = null;
    this.testTimer = null;
  }

  async handleRegister({ clientId, role }) {
    if (role === 'source') {
      await this._setSourceClient(clientId);
      return;
    }

    if (role === 'viewer') {
      if (this.viewerPeers.size >= this.maxViewers) {
        this.sendToClient(clientId, { type: 'error', reason: 'max_viewers_reached' });
        return;
      }
      this.sendToClient(clientId, { type: 'stream-status', active: Boolean(this._activeTrack()) });
    }
  }

  async handleSignal({ clientId, role, message }) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (role === 'source') {
      await this._handleSourceSignal(clientId, message);
      return;
    }

    if (role === 'viewer') {
      await this._handleViewerSignal(clientId, message);
    }
  }

  async disconnectClient(clientId) {
    if (this.sourceClientId === clientId) {
      this._closeSourcePeer();
      this.sourceClientId = null;
      if (!this.testTrack) {
        this._startSyntheticTestStream();
      }
    }

    const viewerPeer = this.viewerPeers.get(clientId);
    if (viewerPeer) {
      viewerPeer.close();
      this.viewerPeers.delete(clientId);
    }
  }

  close() {
    this._closeSourcePeer();
    for (const peer of this.viewerPeers.values()) {
      peer.close();
    }
    this.viewerPeers.clear();

    if (this.testTimer) {
      clearInterval(this.testTimer);
      this.testTimer = null;
    }
  }

  _createPeerConnection(onIceCandidate) {
    const peer = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };
    return peer;
  }

  async _setSourceClient(clientId) {
    if (this.sourceClientId && this.sourceClientId !== clientId) {
      this.sendToClient(this.sourceClientId, { type: 'notice', message: 'source_replaced' });
      this._closeSourcePeer();
    }

    this.sourceClientId = clientId;
    this.sourcePeer = this._createPeerConnection((candidate) => {
      this.sendToClient(clientId, { type: 'candidate', role: 'source', candidate });
    });

    this.sourcePeer.ontrack = (event) => {
      const [track] = event.streams[0]?.getVideoTracks() || [event.track];
      if (!track) {
        return;
      }

      this.sourceTrack = track;
      this.sourceStream = new MediaStream([track]);
      this._stopSyntheticTestStream();
      this._attachTrackToViewers();
      this._broadcastToViewers({ type: 'stream-status', active: true });
    };
  }

  async _handleSourceSignal(clientId, message) {
    if (this.sourceClientId !== clientId || !this.sourcePeer) {
      await this._setSourceClient(clientId);
    }

    if (message.type === 'offer' && message.offer) {
      await this.sourcePeer.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await this.sourcePeer.createAnswer();
      await this.sourcePeer.setLocalDescription(answer);
      this.sendToClient(clientId, { type: 'answer', role: 'source', answer });
      return;
    }

    if (message.type === 'candidate' && message.candidate) {
      try {
        await this.sourcePeer.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (error) {
        this.sendToClient(clientId, { type: 'error', reason: 'source_candidate_rejected' });
      }
    }
  }

  async _handleViewerSignal(clientId, message) {
    let peer = this.viewerPeers.get(clientId);

    if (message.type === 'request-stream') {
      this.sendToClient(clientId, { type: 'stream-status', active: Boolean(this._activeTrack()) });
      return;
    }

    if (message.type === 'offer' && message.offer) {
      if (!peer) {
        peer = this._createViewerPeer(clientId);
      }

      await peer.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.sendToClient(clientId, { type: 'answer', role: 'viewer', answer });
      return;
    }

    if (message.type === 'candidate' && message.candidate) {
      if (!peer) {
        peer = this._createViewerPeer(clientId);
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (error) {
        this.sendToClient(clientId, { type: 'error', reason: 'viewer_candidate_rejected' });
      }
    }
  }

  _createViewerPeer(clientId) {
    const peer = this._createPeerConnection((candidate) => {
      this.sendToClient(clientId, { type: 'candidate', role: 'viewer', candidate });
    });

    this.viewerPeers.set(clientId, peer);
    this._attachTrackToPeer(peer);

    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
        peer.close();
        this.viewerPeers.delete(clientId);
      }
    };

    return peer;
  }

  _activeTrack() {
    return this.sourceTrack || this.testTrack || null;
  }

  _attachTrackToViewers() {
    for (const peer of this.viewerPeers.values()) {
      this._attachTrackToPeer(peer);
    }
  }

  _attachTrackToPeer(peer) {
    const track = this._activeTrack();
    if (!track) {
      return;
    }

    const sender = peer.getSenders().find((candidate) => candidate.track && candidate.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(track);
      return;
    }

    const stream = this.sourceStream || new MediaStream([track]);
    peer.addTrack(track, stream);
  }

  _broadcastToViewers(message) {
    for (const clientId of this.viewerPeers.keys()) {
      this.sendToClient(clientId, message);
    }
  }

  _closeSourcePeer() {
    if (this.sourcePeer) {
      this.sourcePeer.close();
      this.sourcePeer = null;
    }
    this.sourceTrack = null;
    this.sourceStream = null;
    this._attachTrackToViewers();
    this._broadcastToViewers({ type: 'stream-status', active: Boolean(this._activeTrack()) });
  }

  maybeStartTestMode() {
    if (this.sourceClientId || this.sourceTrack) {
      return;
    }

    this._startSyntheticTestStream();
  }

  _startSyntheticTestStream() {
    if (this.testTrack) {
      return;
    }

    if (this.testVideoPath && fs.existsSync(this.testVideoPath)) {
      console.log(`Test mode active. Sample file detected at ${path.relative(process.cwd(), this.testVideoPath)}.`);
    } else {
      console.log('Test mode active. No sample video file detected, using generated test pattern.');
    }

    const width = 640;
    const height = 360;
    const source = new RTCVideoSource();
    const track = source.createTrack();

    let tick = 0;
    this.testTimer = setInterval(() => {
      const data = Buffer.alloc(width * height * 1.5);
      const ySize = width * height;

      for (let i = 0; i < ySize; i += 1) {
        data[i] = (i + tick) % 255;
      }

      const uvStart = ySize;
      for (let i = uvStart; i < data.length; i += 1) {
        data[i] = (tick * 3) % 255;
      }

      source.onFrame(new RTCVideoFrame(data, width, height));
      tick = (tick + 4) % 255;
    }, 1000 / 30);

    this.testSource = source;
    this.testTrack = track;
    this._attachTrackToViewers();
    this._broadcastToViewers({ type: 'stream-status', active: true, mode: 'test' });
  }

  _stopSyntheticTestStream() {
    if (this.testTimer) {
      clearInterval(this.testTimer);
      this.testTimer = null;
    }

    if (this.testTrack) {
      this.testTrack.stop();
      this.testTrack = null;
      this.testSource = null;
    }
  }
}

module.exports = { MediaGateway };
