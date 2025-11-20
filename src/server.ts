import express from "express";
import path from "path";
import cors from "cors";
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
 *  CORS is NOT enabled for the RV API.
 *
 *  Impact:
 *    - HUD (http://localhost:3000) cannot fetch /api routes on 3001.
 *    - Browser will block requests without:
 *        Access-Control-Allow-Origin: *
 *
 *  Current State:
 *    - No `import cors from 'cors'`
 *    - No app.use(cors(...))
 *
 *  (This is expected for now; documented for clarity.)
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
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
// In production you can tighten the origin or read it from an environment variable.

const rvAppPublicPath = path.resolve(__dirname, "..", "rv-app", "public");
/**
 * The RV Studio (rv-app) is NOT embedded inside renderer/index.html.
 * Instead, it is served here at /rv and opened by the HUD via a button.
 */
app.use("/rv", express.static(rvAppPublicPath));
app.get("/rv/*", (_req, res) => {
  res.sendFile(path.join(rvAppPublicPath, "index.html"));
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

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RV backend listening on port ${PORT}`);
  });
}

export default app;
