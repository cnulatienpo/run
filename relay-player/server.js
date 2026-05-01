const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let urlPath = req.url;
  // Remove leading /relay-player/ if present
  if (urlPath.startsWith('/relay-player/')) {
    urlPath = urlPath.slice('/relay-player/'.length);
  } else if (urlPath === "/") {
    urlPath = "index.html";
  } else if (urlPath.startsWith("/")) {
    urlPath = urlPath.slice(1);
  }
  let filePath = path.join(__dirname, urlPath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let ext = path.extname(filePath).toLowerCase();
    let type = "text/plain";
    if (ext === ".html") type = "text/html";
    else if (ext === ".js") type = "application/javascript";
    else if (ext === ".css") type = "text/css";
    else if (ext === ".png") type = "image/png";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
});

server.listen(port, () => {
  console.log("Server running on port", port);
});

function getHoleCenter() {
  if (relayRoot && typeof relayRoot.getBoundingClientRect === 'function') {
    const rect = relayRoot.getBoundingClientRect();
    return {
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2)
    };
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  };
}

const frontLayer = document.getElementById('front-layer');
const backLayer = document.getElementById('back-layer');
const relayRoot = document.getElementById('relay-root');

const NUM_FRAMES = 108;
const assets = Array.from({ length: NUM_FRAMES }, (_, i) =>
  `assets/pngs/final_rgba/f_${String(i).padStart(4, '0')}.png`
);

let frontIndex = 0;
let backIndex = 1;
const totalFrames = NUM_FRAMES;

function loadInitialImages() {
  frontLayer.src = assets[frontIndex];
  backLayer.src = assets[backIndex];
}

function advanceImages() {
  frontIndex = (frontIndex + 1) % totalFrames;
  backIndex = (backIndex + 1) % totalFrames;
  frontLayer.src = backLayer.src;
  backLayer.src = assets[backIndex];
}

function updateCamera(deltaTime) {
  const holeCenter = getHoleCenter();
  frontLayer.style.transformOrigin = `${holeCenter.x}px ${holeCenter.y}px`;
  backLayer.style.transformOrigin = `${holeCenter.x}px ${holeCenter.y}px`;

  const t = Math.min(1, pullStrength * deltaTime);
  cameraPos = {
    x: lerp(cameraPos.x, holeCenter.x, t),
    y: lerp(cameraPos.y, holeCenter.y, t)
  };

  frontLayer.style.transform = `
    translate(${(window.innerWidth / 2) - cameraPos.x}px, ${(window.innerHeight / 2) - cameraPos.y}px)
  `;
  backLayer.style.transform = `
    translate(${(window.innerWidth / 2) - cameraPos.x}px, ${(window.innerHeight / 2) - cameraPos.y}px)
  `;
}

function animate(now) {
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;
  updateCamera(deltaTime);
  // keep back aligned if needed
  // alignBackToHole(); // (optional, if you want to keep this)
  if (distance(cameraPos, getHoleCenter()) < arrivalThreshold * Math.min(window.innerWidth, window.innerHeight)) {
    advanceImages();
    resetCameraToFrameStart();
  }
  requestAnimationFrame(animate);
}

loadInitialImages();
resetCameraToFrameStart();
animate();
