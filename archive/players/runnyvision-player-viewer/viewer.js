/*
THIS IS ARCHIVED PLAYER CODE.
DO NOT USE.
DO NOT MODIFY.
NOT PART OF ACTIVE SYSTEM.
*/

(() => {
  const DEBUG_FAKE_VIDEO = false;

  const container = document.getElementById('canvas-container');
  const streamVideo = document.getElementById('streamVideo');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const planeGeometry = new THREE.PlaneGeometry(2, 2);
  const placeholderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;

      void main() {
        vec2 uv = vUv;
        float wave = 0.5 + 0.5 * sin((uv.x * 8.0) + (uTime * 0.8));
        float pulse = 0.5 + 0.5 * sin((uv.y * 10.0) - (uTime * 1.1));
        vec3 base = vec3(0.08, 0.03, 0.12);
        vec3 accent = vec3(0.43, 0.18, 0.67);
        vec3 color = mix(base, accent, wave * pulse);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  const fullscreenPlane = new THREE.Mesh(planeGeometry, placeholderMaterial);
  scene.add(fullscreenPlane);

  let videoTexture = null;
  let videoMaterial = null;
  let hasLiveVideo = false;

  function sendSignal(socket, message) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function createPeerConnection(signalingSocket) {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.addTransceiver('video', { direction: 'recvonly' });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      sendSignal(signalingSocket, {
        type: 'candidate',
        from: 'viewer',
        to: 'source',
        payload: event.candidate
      });
    };

    peerConnection.ontrack = async (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) {
        return;
      }

      streamVideo.srcObject = remoteStream;
      streamVideo.muted = true;

      try {
        await streamVideo.play();
      } catch (error) {
        console.warn('Autoplay blocked until user interaction:', error);
      }

      if (videoTexture) {
        videoTexture.dispose();
      }

      videoTexture = new THREE.VideoTexture(streamVideo);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.colorSpace = THREE.SRGBColorSpace;

      if (!videoMaterial) {
        videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });
      } else {
        videoMaterial.map = videoTexture;
      }

      if (!hasLiveVideo) {
        fullscreenPlane.material.dispose();
        fullscreenPlane.material = videoMaterial;
      }

      hasLiveVideo = true;
      console.info('Live stream attached to viewer texture.');
    };

    return peerConnection;
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const signalingSocket = new WebSocket(`${wsProtocol}//${window.location.host}`);
  const peerConnection = createPeerConnection(signalingSocket);

  signalingSocket.onopen = () => {
    sendSignal(signalingSocket, {
      type: 'register',
      role: 'viewer'
    });

    if (DEBUG_FAKE_VIDEO) {
      console.info('DEBUG_FAKE_VIDEO enabled: placeholder stays active and no live source is expected.');
    }
  };

  signalingSocket.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.warn('Ignoring malformed signaling message.');
      return;
    }

    if (message.type === 'offer' && message.payload && !DEBUG_FAKE_VIDEO) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSignal(signalingSocket, {
          type: 'answer',
          from: 'viewer',
          to: 'source',
          payload: peerConnection.localDescription
        });
      } catch (error) {
        console.error('Failed to process source offer:', error);
      }
      return;
    }

    if (message.type === 'candidate' && message.payload && !DEBUG_FAKE_VIDEO) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.payload));
      } catch (error) {
        console.warn('Failed to add ICE candidate:', error);
      }
      return;
    }

    if (message.type === 'status' && message.payload?.message === 'registered') {
      console.info('Viewer registered and waiting for source offer.');
    }
  };

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function animate(timeMs) {
    if (!hasLiveVideo) {
      placeholderMaterial.uniforms.uTime.value = timeMs * 0.001;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);
})();
