import express from "express";
import {
  createRunSession,
  listRunsForUser,
} from "../../services/runSessionService";
import { CreateRunSessionInput } from "../../models/runSession";

const router = express.Router();

router.get("/", (req, res) => {
  const sessions = listRunsForUser(req.userId);
  res.json(sessions);
});

router.post("/", (req, res, next) => {
  try {
    const { steps, places } = req.body as CreateRunSessionInput;

    if (!Number.isFinite(steps) || steps <= 0) {
      return res.status(400).json({ message: "steps must be a positive number" });
    }

    if (!Array.isArray(places) || places.length === 0) {
      return res
        .status(400)
        .json({ message: "places must include at least one stop" });
    }

    const trimmedPlaces = places.map((place) => `${place}`.trim()).filter(Boolean);
    if (!trimmedPlaces.length) {
      return res
        .status(400)
        .json({ message: "places must include at least one stop" });
    }
    const session = createRunSession(req.userId, {
      steps: Math.round(Number(steps)),
      places: trimmedPlaces,
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

export default router;
