// RunnyVision backend serves the UI, APIs, and Backblaze access.
import "dotenv/config";
import express from "express";
import path from "path";

import experienceRouter from "./passport/routes/experience";
import profilesRouter from "./passport/routes/profiles";
import runStatsRouter from "./passport/routes/runStats";
import passportRouter from "./passport/routes/passport";
import healthRouter from "./passport/routes/health";
import clipsRouter from "./passport/routes/clips";
import usersRouter from "./passport/routes/users";
import runSessionsRouter from "./passport/routes/runSessions";
import mediaRouter from "./passport/routes/media";

/**
 * ============================================================
 * RV SERVER — CANONICAL RESPONSIBILITY
 * ============================================================
 *
 * This server does exactly three things:
 *
 * 1. Serve the RV UI at /rv
 * 2. Serve the Passport UI at /passport
 * 3. Serve RV API routes at /api/*
 *
 * It does NOT:
 * - start other backends
 * - read Backblaze credentials
 * - embed HUD logic
 * - contain legacy or experimental behavior
 *
 * If something does not clearly belong to those three roles,
 * it does not live in this file.
 * ============================================================
 */

/* ------------------------------------------------------------
 * Environment
 * ------------------------------------------------------------ */

const resourcesPath = (
  process as NodeJS.Process & { resourcesPath?: string }
).resourcesPath;

const isProd = Boolean(resourcesPath);

/* ------------------------------------------------------------
 * App Init
 * ------------------------------------------------------------ */

const app = express();

/* ------------------------------------------------------------
 * Dev sanity: no caching
 * ------------------------------------------------------------ */

app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

/* ------------------------------------------------------------
 * JSON + CORS
 * ------------------------------------------------------------ */

app.use(express.json());

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-user-id"
  );

  if (_req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/* ------------------------------------------------------------
 * Static UI Hosting
 * ------------------------------------------------------------ */

// RV UI
const rvUiPath = isProd
  ? path.join(resourcesPath as string, "rv")
  : path.resolve(__dirname, "..", "rv-app", "public");

// Passport UI
const passportUiPath = isProd
  ? path.join(resourcesPath as string, "passport")
  : path.resolve(__dirname, "..", "passport", "dist");

// Serve RV UI
app.use("/rv", express.static(rvUiPath));
app.get("/rv/*", (_req, res) => {
  res.sendFile(path.join(rvUiPath, "index.html"));
});

// Serve Passport UI
app.use("/passport", express.static(passportUiPath));
app.get("/passport/*", (_req, res) => {
  res.sendFile(path.join(passportUiPath, "index.html"));
});

/* ------------------------------------------------------------
 * Dev user context (temporary, explicit)
 * ------------------------------------------------------------ */

app.use((req, _res, next) => {
  // Dev-only: every request has a stable user
  req.userId = "dev-user";
  next();
});

/* ------------------------------------------------------------
 * RV API Routes
 * ------------------------------------------------------------ */

app.use("/api/health", healthRouter);
app.use("/api/experience", experienceRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/run", runStatsRouter);
app.use("/api/clips", clipsRouter);
app.use("/api/run-sessions", runSessionsRouter);
app.use("/api/passport", passportRouter);
app.use("/api/users", usersRouter);
app.use("/api/media", mediaRouter);

/* ------------------------------------------------------------
 * Server Start
 * ------------------------------------------------------------ */

const PORT = process.env.PORT
  ? Number(process.env.PORT)
  : 3001;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RV backend listening on http://localhost:${PORT}`);
  });
}

export default app;
