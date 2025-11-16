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
router.get("/", (req, res) => {
  const userId = getUserId(req);
  const profiles = listProfiles(userId);
  res.json(profiles);
});

/**
 * GET /api/profiles/:id
 * Returns a single Experience profile by id.
 */
router.get("/:id", (req, res) => {
  const userId = getUserId(req);
  const profile = getProfile(userId, req.params.id);
  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }
  res.json(profile);
});

/**
 * POST /api/profiles
 * Creates a new Experience profile for the current user.
 */
router.post("/", (req, res) => {
  const userId = getUserId(req);
  const validation = validateProfilePayload(req.body);
  if (!validation.valid || !validation.data) {
    return res.status(400).json({ error: validation.errors?.join(", ") });
  }

  const profile = createProfile(
    userId,
    validation.data.name,
    validation.data.settings
  );
  res.status(201).json(profile);
});

/**
 * PUT /api/profiles/:id
 * Updates the name and/or settings on an existing profile.
 */
router.put("/:id", (req, res) => {
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
    return res.status(400).json({ error: "name must be a non-empty string" });
  }

  const updated = updateProfile(userId, req.params.id, {
    name: typeof name === "string" ? name.trim() : undefined,
    settings: validatedSettings,
  });

  if (!updated) {
    return res.status(404).json({ error: "Profile not found" });
  }

  res.json(updated);
});

/**
 * DELETE /api/profiles/:id
 * Removes a profile for the current user.
 */
router.delete("/:id", (req, res) => {
  const userId = getUserId(req);
  const deleted = deleteProfile(userId, req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Profile not found" });
  }
  res.status(204).send();
});

export default router;
