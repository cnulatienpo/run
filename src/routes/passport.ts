import express from "express";
import { getPassportSummary } from "../services/passportService";

const router = express.Router();

router.get("/summary", async (req, res, next) => {
  try {
    const userId = req.userId;
    const summary = await getPassportSummary(userId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
