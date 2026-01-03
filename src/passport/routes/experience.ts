import express from "express";
import {
  getExperienceSettings,
  saveExperienceSettings,
} from "../../services/experienceService";
import {
  selectClipsForSession,
} from "../../services/clipSelectionService";
import { ClipMetadata } from "../../models/clip";
import { ExperienceSettings } from "../../models/experience";
import { formatAjvErrors, validateRequestBody } from "../../validation/middleware";
import { validateExperienceSettings } from "../../validation/schemas";

const router = express.Router();

/**
 * GET /api/experience
 * Returns the persisted ExperienceSettings for the current user.
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.userId;
    const settings = await getExperienceSettings(userId);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/experience
 * Saves a new ExperienceSettings payload for the current user.
 */
router.put(
  "/",
  validateRequestBody(validateExperienceSettings),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const settings = req.body as ExperienceSettings;
      const saved = await saveExperienceSettings(userId, settings);
      res.json(saved);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/experience/select-clips
 * Allows the frontend to preview what clips would be selected for a session.
 */
router.post("/select-clips", async (req, res, next) => {
  try {
    const userId = req.userId;
    const body = req.body ?? {};
    if (!Array.isArray(body.clips)) {
      return res.status(400).json({ error: "clips array is required" });
    }
    const clips: ClipMetadata[] = body.clips;

    let settings = await getExperienceSettings(userId);
    if (body.settings) {
      if (!validateExperienceSettings(body.settings)) {
        return res
          .status(400)
          .json({ error: formatAjvErrors(validateExperienceSettings.errors) });
      }
      settings = body.settings as ExperienceSettings;
    }

    const selected = selectClipsForSession(clips, settings);
    res.json(selected);
  } catch (err) {
    next(err);
  }
});

export default router;
