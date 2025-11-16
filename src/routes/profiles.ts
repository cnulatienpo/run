import express from "express";
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
} from "../services/profileService";
import { validateRequestBody } from "../validation/middleware";
import type {
  CreateProfilePayload,
  UpdateProfilePayload,
} from "../validation/schemas";
import {
  validateCreateProfilePayload,
  validateUpdateProfilePayload,
} from "../validation/schemas";

const router = express.Router();

function getUserId(req: express.Request): string {
  return req.userId ?? "demo-user";
}

/**
 * GET /api/profiles
 * Lists all saved Experience profiles for the current user.
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const profiles = await listProfiles(userId);
    res.json(profiles);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profiles/:id
 * Returns a single Experience profile by id.
 */
router.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const profile = await getProfile(userId, req.params.id);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profiles
 * Creates a new Experience profile for the current user.
 */
router.post(
  "/",
  validateRequestBody(validateCreateProfilePayload),
  async (req, res, next) => {
    try {
      const userId = getUserId(req);
      const payload = req.body as CreateProfilePayload;
      const profile = await createProfile(
        userId,
        payload.name.trim(),
        payload.settings
      );
      res.status(201).json(profile);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/profiles/:id
 * Updates the name and/or settings on an existing profile.
 */
router.put(
  "/:id",
  validateRequestBody(validateUpdateProfilePayload),
  async (req, res, next) => {
    try {
      const userId = getUserId(req);
      const payload = req.body as UpdateProfilePayload;
      const updated = await updateProfile(userId, req.params.id, {
        name: payload.name ? payload.name.trim() : undefined,
        settings: payload.settings,
      });

      if (!updated) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/profiles/:id
 * Removes a profile for the current user.
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const deleted = await deleteProfile(userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
