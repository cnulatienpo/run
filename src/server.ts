import express from "express";
import path from "path";
import experienceRouter from "./routes/experience";
import profilesRouter from "./routes/profiles";
import runStatsRouter from "./routes/runStats";
import passportRouter from "./routes/passport";
import healthRouter from "./routes/health";
import clipsRouter from "./routes/clips";
import usersRouter from "./routes/users";
import { ensureDefaultUser } from "./services/userService";

/**
 * ------------------------------------------------------------
 *  WIRING ASSERTION A6 – FAIL
 * ------------------------------------------------------------
 *  CORS is now enabled via a small inlined middleware.
 *
 *  Impact:
 *    - HUD (http://localhost:3000) cannot fetch /api routes on 3001.
 *    - Browser will block requests without:
 *        Access-Control-Allow-Origin: *
 *
 *  Current State:
 *    - `Access-Control-Allow-*` headers are set manually for
 *      http://localhost:3000.
 * ------------------------------------------------------------
 */

/**
 * ============================================================
 *  RV API – DEVELOPMENT NOTES
 * ------------------------------------------------------------
 *  Role:
 *    - Backend server for Run & Learn features.
 *    - Provides /api/experience, /api/profiles, /api/run,
 *      /api/clips, /api/users, and more.
 *
 *  Dev Startup:
 *    - There is NO npm script for this server.
 *    - Start manually using:
 *          npx ts-node src/server.ts
 *    - Listens on PORT or 3001.
 *
 *  Notes:
 *    - Separate from legacy noodle backend (backend/).
 *    - HUD cannot reach this server without CORS or proxy.
 * ============================================================
 */

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-user-id"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
/**
 * HOSTING GAP:
 * Originally, rv-app/public was NOT hosted by any backend.
 * TypeScript output wrote to public/build/,
 * but no Express static route existed.
 * Developers had to manually open public/index.html.
 *
 * RESOLUTION:
 * Express now serves /rv from rv-app/public.
 */
const rvAppPublicPath = path.resolve(__dirname, "..", "rv-app", "public");
const rvAppIndexHtmlPath = path.join(rvAppPublicPath, "index.html");
/**
 * The RV Studio (rv-app) is NOT embedded inside renderer/index.html.
 * Instead, it is served here at /rv and opened by the HUD via a button.
 */
app.use("/rv", express.static(rvAppPublicPath));
app.get("/rv/*", (_req, res) => {
  res.sendFile(rvAppIndexHtmlPath);
});

app.use(async (req, _res, next) => {
  try {
    const headerUserId = req.header("x-user-id");
    if (headerUserId) {
      req.userId = headerUserId;
      return next();
    }

    const defaultUser = await ensureDefaultUser();
    req.userId = defaultUser.id;
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * ------------------------------------------------------------
 * RV API ROUTES (port 3001)
 * ------------------------------------------------------------
 * Exposed endpoints:
 *   GET    /api/health
 *   GET    /api/experience
 *   GET    /api/profiles
 *   GET    /api/run
 *   GET    /api/clips
 *   GET    /api/passport
 *   GET    /api/users
 *
 * Notes:
 *   - This server listens on process.env.PORT or 3001.
 *   - Does NOT enable CORS by default.
 *   - HUD (http://localhost:3000) cannot fetch these routes
 *     without CORS or proxy support.
 * ------------------------------------------------------------
 */
app.use("/api/health", healthRouter);
app.use("/api/experience", experienceRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/run", runStatsRouter);
app.use("/api/clips", clipsRouter);
app.use("/api/passport", passportRouter);
app.use("/api/users", usersRouter);

/**
 * BACKEND SPLIT:
 * RV API on port 3001.
 * Legacy backend on port 4000.
 * These servers are unrelated but coexist.
 * Developers must manually run the correct one.
 */
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RV backend listening on port ${PORT}`);
  });
}

export default app;
