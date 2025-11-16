import express from "express";
import {
  endSession,
  getHistory,
  getRunStats,
  startSession,
  updateSessionTelemetry,
} from "../services/runStatsService";
import { validateTelemetryPayload } from "../utils/validation";

const router = express.Router();

function getUserId(req: express.Request): string {
  return req.userId ?? "demo-user";
}

/**
 * POST /api/run/start
 * Starts a new telemetry session for the current user.
 */
router.post("/start", (req, res) => {
  const userId = getUserId(req);
  const { trainingType, goalName } = req.body ?? {};
  if (trainingType !== undefined && typeof trainingType !== "string") {
    return res.status(400).json({ error: "trainingType must be a string" });
  }
  if (goalName !== undefined && typeof goalName !== "string") {
    return res.status(400).json({ error: "goalName must be a string" });
  }

  startSession(userId, trainingType, goalName);
  res.status(201).json({ status: "started" });
});

/**
 * POST /api/run/telemetry
 * Ingests live telemetry and returns current RunStats snapshot.
 */
router.post("/telemetry", (req, res) => {
  const userId = getUserId(req);
  const validation = validateTelemetryPayload(req.body);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ error: validation.errors?.join(", ") });
  }

  try {
    const stats = updateSessionTelemetry(userId, validation.data);
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/run/end
 * Ends the active session and archives it into run history.
 */
router.post("/end", (req, res) => {
  const userId = getUserId(req);
  const historyEntry = endSession(userId);
  if (!historyEntry) {
    return res.status(400).json({ error: "No active session" });
  }
  res.json(historyEntry);
});

/**
 * GET /api/run/stats
 * Returns current session stats merged with run history.
 */
router.get("/stats", (req, res) => {
  const userId = getUserId(req);
  const stats = getRunStats(userId);
  res.json(stats);
});

/**
 * GET /api/run/history
 * Returns only the historical runs without the live session data.
 */
router.get("/history", (req, res) => {
  const userId = getUserId(req);
  const history = getHistory(userId);
  res.json(history);
});

export default router;
