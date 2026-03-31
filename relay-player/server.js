const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url.slice(1));
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
