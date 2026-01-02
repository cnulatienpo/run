// dev/hud-dev-server.js
// ============================================================
// DEV HALLWAY — ONE DOOR ONLY
// Port 3000 exists ONLY to forward traffic to the real app.
// It never serves RV files directly.
// ============================================================

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const PORT = 3000;
const RV_BACKEND_TARGET = "http://localhost:3001";

/* ------------------------------------------------------------
 * No caching (dev sanity)
 * ------------------------------------------------------------ */
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

/* ------------------------------------------------------------
 * ONE DOOR RULE
 * ------------------------------------------------------------ */

// RV UI → backend
app.use(
  "/rv",
  createProxyMiddleware({
    target: RV_BACKEND_TARGET,
    changeOrigin: true,
    ws: true,
    logLevel: "warn",
  })
);

// RV API → backend
app.use(
  "/api",
  createProxyMiddleware({
    target: RV_BACKEND_TARGET,
    changeOrigin: true,
    ws: true,
  })
);

/* ------------------------------------------------------------
 * HUD shell only (optional)
 * ------------------------------------------------------------ */

app.use(express.static(path.join(__dirname, "..", "renderer")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "renderer", "index.html"));
});

/* ------------------------------------------------------------
 * Start
 * ------------------------------------------------------------ */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HUD dev hallway running at http://localhost:${PORT}`);
});
