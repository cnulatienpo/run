const http = require("http")
const fs = require("fs")
const path = require("path")

const port = process.env.PORT || 3010

const RELAY_DIR = __dirname
const ASSETS_DIR = path.resolve(__dirname, "..", "assets")

// Sort files like: frame1, frame2, frame10 (not frame10 before frame2)
function naturalSortKey(name) {
  const base = name.replace(/\.[^.]+$/, "")
  const match = base.match(/\d+/g)
  const num = match ? Number(match[match.length - 1]) : NaN

  return {
    hasNumber: Number.isFinite(num),
    number: num,
    name: name.toLowerCase()
  }
}

// Return all PNG files in /assets
function listPngs() {
  const entries = fs.readdirSync(ASSETS_DIR, { withFileTypes: true })

  return entries
    .filter(e => e.isFile() && /\.png$/i.test(e.name))
    .map(e => e.name)
    .sort((a, b) => {
      const ka = naturalSortKey(a)
      const kb = naturalSortKey(b)

      if (ka.hasNumber && kb.hasNumber && ka.number !== kb.number) {
        return ka.number - kb.number
      }

      if (ka.hasNumber !== kb.hasNumber) {
        return ka.hasNumber ? -1 : 1
      }

      return ka.name.localeCompare(kb.name)
    })
}

const server = http.createServer((req, res) => {
  let urlPath = req.url

  // normalize path
  if (urlPath === "/") {
    urlPath = "index.html"
  } else if (urlPath.startsWith("/")) {
    urlPath = urlPath.slice(1)
  }

  // JSON index endpoint
  if (urlPath === "assets/__index__.json") {
    try {
      const files = listPngs()
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ files }))
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Failed to list assets" }))
    }
    return
  }

  if (req.url === "/favicon.ico") {
    res.writeHead(204)
    res.end()
    return
  }

  // resolve file path
  let filePath

  if (urlPath.startsWith("assets/")) {
    filePath = path.join(ASSETS_DIR, urlPath.slice("assets/".length))
  } else {
    filePath = path.join(RELAY_DIR, urlPath)
  }

  // prevent escaping directories
  if (!filePath.startsWith(RELAY_DIR) && !filePath.startsWith(ASSETS_DIR)) {
    res.writeHead(403)
    res.end("Forbidden")
    return
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404)
      res.end("Not found")
      return
    }

    const ext = path.extname(filePath).toLowerCase()

    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".json": "application/json"
    }

    res.writeHead(200, {
      "Content-Type": types[ext] || "text/plain"
    })

    res.end(content)
  })
})

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
