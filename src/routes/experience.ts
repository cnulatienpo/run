import express from "express";
import {
  getExperienceSettings,
  saveExperienceSettings,
} from "../services/experienceService";
import {
  ClipMetadata,
  selectClipsForSession,
} from "../services/clipSelectionService";
import { validateExperienceSettings } from "../utils/validation";

const router = express.Router();

function getUserId(req: express.Request): string {
  return req.userId ?? "demo-user";
}

/**
 * GET /api/experience
 * Returns the persisted ExperienceSettings for the current user.
 */
router.get("/", (req, res) => {
  const userId = getUserId(req);
  const settings = getExperienceSettings(userId);
  res.json(settings);
});

/**
 * PUT /api/experience
 * Saves a new ExperienceSettings payload for the current user.
 */
router.put("/", (req, res) => {
  const userId = getUserId(req);
  const validation = validateExperienceSettings(req.body);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ error: validation.errors?.join(", ") });
  }

  const saved = saveExperienceSettings(userId, validation.data);
  res.json(saved);
});

/**
 * POST /api/experience/select-clips
 * Allows the frontend to preview what clips would be selected for a session.
 */
router.post("/select-clips", (req, res) => {
  const userId = getUserId(req);
  const body = req.body ?? {};
  if (!Array.isArray(body.clips)) {
    return res.status(400).json({ error: "clips array is required" });
  }
  const clips: ClipMetadata[] = body.clips;

  let settings = getExperienceSettings(userId);
  if (body.settings) {
    const validation = validateExperienceSettings(body.settings);
    if (!validation.valid || !validation.data) {
      return res.status(400).json({ error: validation.errors?.join(", ") });
    }
    settings = validation.data;
  }

  const selected = selectClipsForSession(clips, settings);
  res.json(selected);
});

export default router;
