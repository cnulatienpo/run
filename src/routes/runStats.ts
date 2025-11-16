import express from "express";
import {
  endSession,
  getHistory,
  getRunStats,
  startSession,
  updateSessionTelemetry,
} from "../services/runStatsService";
import { validateBody } from "../middleware/validateBody";
import type { RunStartPayload, RunTelemetryPayload } from "../validation/schemas";
import { validateRunStartPayload, validateRunTelemetryPayload } from "../validation/schemas";

const router = express.Router();

function getUserId(req: express.Request): string {
  return req.userId ?? "demo-user";
}

/**
 * POST /api/run/start
 * Starts a new telemetry session for the current user.
 */
router.post(
  "/start",
  validateBody(validateRunStartPayload),
  async (req, res, next) => {
    try {
      const userId = getUserId(req);
      const { trainingType, goalName } = req.body as RunStartPayload;
      await startSession(userId, trainingType, goalName);
      res.status(201).json({ status: "started" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/run/telemetry
 * Ingests live telemetry and returns current RunStats snapshot.
 */
router.post(
  "/telemetry",
  validateBody(validateRunTelemetryPayload),
  async (req, res) => {
    const userId = getUserId(req);
    const payload = req.body as RunTelemetryPayload;

    try {
      const stats = await updateSessionTelemetry(userId, payload);
      res.json(stats);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

/**
 * POST /api/run/end
 * Ends the active session and archives it into run history.
 */
router.post("/end", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const historyEntry = await endSession(userId);
    if (!historyEntry) {
      return res.status(400).json({ error: "No active session" });
    }
    res.json(historyEntry);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/run/stats
 * Returns current session stats merged with run history.
 */
router.get("/stats", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const stats = await getRunStats(userId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/run/history
 * Returns only the historical runs without the live session data.
 */
router.get("/history", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const history = await getHistory(userId);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

export default router;
