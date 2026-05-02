const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;
const RELAY_DIR = __dirname;
const SHARED_ASSETS_DIR = path.resolve(__dirname, "..", "assets");

function naturalSortKey(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const numberMatches = base.match(/\d+/g);
  const number = numberMatches ? Number(numberMatches[numberMatches.length - 1]) : Number.NaN;
  return {
    hasNumber: Number.isFinite(number),
    number,
    name: fileName.toLowerCase(),
  };
}

function listAssetPngs() {
  const entries = fs.readdirSync(SHARED_ASSETS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const ka = naturalSortKey(a);
      const kb = naturalSortKey(b);
      if (ka.hasNumber && kb.hasNumber && ka.number !== kb.number) {
        return ka.number - kb.number;
      }
      if (ka.hasNumber !== kb.hasNumber) {
        return ka.hasNumber ? -1 : 1;
      }
      return ka.name.localeCompare(kb.name);
    });
}

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

  if (urlPath === "assets/__index__.json") {
    try {
      const files = listAssetPngs();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ files }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to list assets", detail: String(err && err.message ? err.message : err) }));
    }
    return;
  }

  let filePath = null;
  if (urlPath.startsWith("assets/")) {
    filePath = path.join(SHARED_ASSETS_DIR, urlPath.slice("assets/".length));
  } else {
    filePath = path.join(RELAY_DIR, urlPath);
  }

  if (!filePath.startsWith(RELAY_DIR) && !filePath.startsWith(SHARED_ASSETS_DIR)) {
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
