import express from "express";
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
} from "../services/profileService";
import {
  validateExperienceSettings,
  validateProfilePayload,
} from "../utils/validation";

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
router.post("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const validation = validateProfilePayload(req.body);
    if (!validation.valid || !validation.data) {
      return res.status(400).json({ error: validation.errors?.join(", ") });
    }

    const profile = await createProfile(
      userId,
      validation.data.name,
      validation.data.settings
    );
    res.status(201).json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/profiles/:id
 * Updates the name and/or settings on an existing profile.
 */
router.put("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { name, settings } = req.body ?? {};
    let validatedSettings = undefined;

    if (settings !== undefined) {
      const validation = validateExperienceSettings(settings);
      if (!validation.valid || !validation.data) {
        return res.status(400).json({ error: validation.errors?.join(", ") });
      }
      validatedSettings = validation.data;
    }

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res
        .status(400)
        .json({ error: "name must be a non-empty string" });
    }

    const updated = await updateProfile(userId, req.params.id, {
      name: typeof name === "string" ? name.trim() : undefined,
      settings: validatedSettings,
    });

    if (!updated) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

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
