import express from "express";
import {
  createUser,
  deleteUser,
  ensureDefaultUser,
  getUser,
  listUsers,
  updateUser,
} from "../../services/userService";

const router = express.Router();

/**
 * Frontend integration notes:
 * - Call GET /api/users on startup to populate a local profile picker.
 * - Once a profile is chosen, store its id (e.g. in memory or localStorage)
 *   and attach it to every backend request via the x-user-id header.
 * - If no user has been selected yet, omit the header and the backend will
 *   fall back to the default profile created by ensureDefaultUser().
 */

function sanitizeUserPayload(body: any): {
  name?: string;
  color?: string;
  avatarEmoji?: string;
  isDefault?: boolean;
} {
  const payload: {
    name?: string;
    color?: string;
    avatarEmoji?: string;
    isDefault?: boolean;
  } = {};

  const hasOwn = (key: string): boolean =>
    body != null && Object.prototype.hasOwnProperty.call(body, key);

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name) {
      payload.name = name;
    }
  }

  if (hasOwn("color")) {
    if (body.color === null) {
      payload.color = "";
    } else if (typeof body.color === "string") {
      const color = body.color.trim();
      if (color) {
        payload.color = color;
      }
    }
  }

  if (hasOwn("avatarEmoji")) {
    if (body.avatarEmoji === null) {
      payload.avatarEmoji = "";
    } else if (typeof body.avatarEmoji === "string") {
      const avatarEmoji = body.avatarEmoji.trim();
      if (avatarEmoji) {
        payload.avatarEmoji = avatarEmoji;
      }
    }
  }

  if (typeof body?.isDefault === "boolean") {
    payload.isDefault = body.isDefault;
  }

  return payload;
}

router.get("/", async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = sanitizeUserPayload(req.body);
    const { name } = payload;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const created = await createUser({
      name,
      color: payload.color,
      avatarEmoji: payload.avatarEmoji,
      isDefault: payload.isDefault,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const payload = sanitizeUserPayload(req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    const updated = await updateUser(req.params.id, payload);
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const existing = await getUser(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    await deleteUser(existing.id);

    if (existing.isDefault) {
      await ensureDefaultUser();
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
