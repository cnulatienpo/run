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
  const uniforms = {
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uVideoTexture: { value: null }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;

      void main() {
        vec2 uv = vUv;
        float wave = sin((uv.x * 12.0) + (uTime * 0.9)) * 0.1;
        float glow = sin((uv.y * 16.0) - (uTime * 1.4)) * 0.08;

        vec3 colorA = vec3(0.04, 0.07, 0.14);
        vec3 colorB = vec3(0.06, 0.3, 0.44);
        vec3 colorC = vec3(0.8, 0.22, 0.48);

        float blend = smoothstep(0.1, 0.9, uv.y + wave + glow);
        vec3 color = mix(colorA, colorB, blend);
        color = mix(color, colorC, smoothstep(0.6, 1.0, uv.x + wave * 0.8));

        float pulse = 0.04 * sin(uTime * 2.0 + uv.x * 8.0 + uv.y * 6.0);
        color += pulse;

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  const plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  // Placeholder utility for the upcoming WebRTC video integration.
  function attachVideoStream(videoElement) {
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    uniforms.uVideoTexture.value = videoTexture;
    return videoTexture;
  }

  // Keep available for later wiring from WebRTC code.
  window.runnyvisionViewer = {
    scene,
    camera,
    renderer,
    attachVideoStream,
    streamVideo
  };

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  }

  function animate(time) {
    uniforms.uTime.value = time * 0.001;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);
})();
