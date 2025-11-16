import express from "express";
import { getHistory } from "../services/runStatsService";
import {
  getStoredMilestones,
  getStoredStamps,
  recomputePassportForUser,
} from "../services/passportService";

const router = express.Router();

function getUserId(req: express.Request): string {
  return req.userId ?? "demo-user";
}

router.get("/summary", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const history = await getHistory(userId);
    const summary = await recomputePassportForUser(userId, history);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get("/stamps", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const stamps = await getStoredStamps(userId);
    res.json(stamps);
  } catch (err) {
    next(err);
  }
});

router.get("/milestones", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const milestones = await getStoredMilestones(userId);
    res.json(milestones);
  } catch (err) {
    next(err);
  }
});

export default router;
