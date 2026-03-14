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

  function attachIncomingStream(stream) {
    streamVideo.srcObject = stream;
    streamVideo.muted = true;
    streamVideo
      .play()
      .then(() => applyVideoTexture(streamVideo))
      .catch((error) => {
        console.error('Unable to start video playback:', error);
      });
  }

  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const signalingSocket = new WebSocket(`${wsProtocol}//${window.location.host}`);

  async function sendSignal(message) {
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
    if (remoteStream) {
      attachIncomingStream(remoteStream);
    }
  };

  async function createAndSendOffer() {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSignal({ type: 'offer', offer });
  }

  signalingSocket.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.warn('Ignoring malformed signaling payload.');
      return;
    }

    if (message.type === 'welcome') {
      if (message.existingPeers > 0) {
        await createAndSendOffer();
      }
      return;
    }

    if (message.type === 'offer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      sendSignal({ type: 'answer', answer });
      return;
    }

    if (message.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
      return;
    }

    if (message.type === 'candidate' && message.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (error) {
        console.warn('Error applying ICE candidate:', error);
      }
    }
  };

  async function setupLocalTestStream() {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ video: true });
      for (const track of localStream.getTracks()) {
        peerConnection.addTrack(track, localStream);
      }
      if (!streamVideo.srcObject) {
        attachIncomingStream(localStream);
      }
    } catch (error) {
      console.error('Unable to access webcam test stream:', error);
    }
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function animate() {
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  setupLocalTestStream();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);
})();
