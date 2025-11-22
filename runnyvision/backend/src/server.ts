import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { RunSession, RouteConfig } from "../../shared/types";
import { createRunsRouter } from "./routes/runs";
import { createPassportRouter } from "./routes/passport";
import { createRoutesConfigRouter } from "./routes/routesConfig";
import { createCreatorRouter } from "./routes/creator";

const PORT = process.env.PORT || 4000;
const FRONTEND_DIST = path.join(__dirname, "../../frontend/dist");

const runsPath = path.join(__dirname, "data", "runs.json");
const routesPath = path.join(__dirname, "data", "routes.json");

function loadJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Failed to load ${filePath}`, err);
    return fallback;
  }
}

function saveJson<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const runs: RunSession[] = loadJson<RunSession[]>(runsPath, []);
const routes: RouteConfig[] = loadJson<RouteConfig[]>(routesPath, []);

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
app.use(express.json());

app.use("/api/runs", createRunsRouter({ runs, saveRuns: (data) => saveJson(runsPath, data) }));
app.use("/api/passport", createPassportRouter({ runs }));
app.use("/api/routes", createRoutesConfigRouter({ routes }));
app.use(
  "/api/creator",
  createCreatorRouter({ routes, saveRoutes: (data) => saveJson(routesPath, data) })
);

app.use(express.static(FRONTEND_DIST));
app.get("*", (req, res, next) => {
  const requestedPath = req.path;
  if (requestedPath.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(FRONTEND_DIST, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(200).send("RunnyVision backend running. Build frontend to serve static files.");
});

app.listen(PORT, () => {
  console.log(`RunnyVision backend listening on http://localhost:${PORT}`);
});
