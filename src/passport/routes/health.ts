import express from "express";

const router = express.Router();

/**
 * GET /api/health
 * Simple liveness probe used by the Electron shell.
 */
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
