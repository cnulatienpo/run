(() => {
  const container = document.getElementById('canvas-container');
  const streamVideo = document.getElementById('streamVideo');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  let videoTexture = null;
  function applyVideoTexture(videoElement) {
    if (videoTexture) {
      videoTexture.dispose();
    }

    videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    material.map = videoTexture;
    material.needsUpdate = true;
  }

  async function attachIncomingStream(stream) {
    if (!stream) {
      return;
    }

    streamVideo.srcObject = stream;
    streamVideo.muted = true;

    try {
      await streamVideo.play();
      applyVideoTexture(streamVideo);
    } catch (error) {
      console.error('Unable to start video playback:', error);
    }
  }

  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  peerConnection.addTransceiver('video', { direction: 'recvonly' });

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const signalingSocket = new WebSocket(`${wsProtocol}//${window.location.host}`);

  function sendSignal(message) {
    if (signalingSocket.readyState === WebSocket.OPEN) {
      signalingSocket.send(JSON.stringify(message));
    }
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ type: 'candidate', candidate: event.candidate });
    }
  };

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    attachIncomingStream(remoteStream);
  };

  async function requestStream() {
    sendSignal({ type: 'request-stream' });

    const offer = await peerConnection.createOffer({ offerToReceiveVideo: true });
    await peerConnection.setLocalDescription(offer);
    sendSignal({ type: 'offer', offer });
  }

  signalingSocket.onopen = () => {
    sendSignal({ type: 'register', role: 'viewer' });
  };

  signalingSocket.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.warn('Ignoring malformed signaling payload.');
      return;
    }

    if (message.type === 'registered' && message.role === 'viewer') {
      await requestStream();
      return;
    }

    if (message.type === 'answer' && message.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
      return;
    }

    if (message.type === 'candidate' && message.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (error) {
        console.warn('Error applying ICE candidate:', error);
      }
      return;
    }

    if (message.type === 'stream-status' && !message.active) {
      console.info('Gateway connected, waiting for source stream...');
      return;
    }

    if (message.type === 'error') {
      console.error('Signaling error:', message.reason);
    }
  };

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);
})();
