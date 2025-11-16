import express from "express";
import { ClipMetadata, ClipSourceType } from "../models/clip";
import {
  ClipQuery,
  CreateClipInput,
  createClip,
  deleteClip,
  getClipById,
  listClips,
  updateClip,
} from "../services/clipLibraryService";
import { enrichAllClips } from "../services/clipEnrichmentService";
import { selectClipsForUserSession } from "../services/clipSelectionService";
import { validateBody } from "../middleware/validateBody";
import { ClipSelectPayload, validateClipSelectPayload } from "../validation/schemas";

const router = express.Router();

function parseCommaSeparated(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function isClipSourceType(value: any): value is ClipSourceType {
  return value === "YOUTUBE" || value === "LOCAL" || value === "GAME_CAPTURE";
}

function validateClipInput(input: any): input is CreateClipInput {
  if (!input || typeof input !== "object") return false;
  if (!isClipSourceType(input.sourceType)) return false;
  if (typeof input.urlOrPath !== "string" || input.urlOrPath.length === 0) {
    return false;
  }
  if (input.tags && !Array.isArray(input.tags)) return false;
  return true;
}

router.post("/ingest", async (req, res) => {
  const payload = req.body;
  const clips = payload?.clips;
  if (!Array.isArray(clips) || clips.length === 0) {
    return res.status(400).json({ error: "clips array is required" });
  }

  try {
    const created: ClipMetadata[] = [];
    for (const clipInput of clips) {
      if (!validateClipInput(clipInput)) {
        return res.status(400).json({ error: "Invalid clip payload" });
      }
      created.push(await createClip(clipInput));
    }
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/", async (req, res) => {
  const query: ClipQuery = {};
  const tagsAny = parseCommaSeparated(req.query.tagsAny);
  const tagsAll = parseCommaSeparated(req.query.tagsAll);
  const sourceTypes = parseCommaSeparated(req.query.sourceTypes) as
    | ClipSourceType[]
    | undefined;

  if (tagsAny) query.tagsAny = tagsAny;
  if (tagsAll) query.tagsAll = tagsAll;
  if (sourceTypes && sourceTypes.length > 0) query.sourceTypes = sourceTypes;
  if (typeof req.query.environment === "string") {
    query.environment = req.query.environment as ClipQuery["environment"];
  }
  if (typeof req.query.peopleDensity === "string") {
    query.peopleDensity = req.query.peopleDensity as ClipQuery["peopleDensity"];
  }
  if (typeof req.query.urbanity === "string") {
    query.urbanity = req.query.urbanity as ClipQuery["urbanity"];
  }

  const boolFields: Array<keyof Pick<ClipQuery, "isNight" | "isAnimated" | "isGameEnvironment" | "isClubLike" | "excludeCtaOrSponsor">> = [
    "isNight",
    "isAnimated",
    "isGameEnvironment",
    "isClubLike",
    "excludeCtaOrSponsor",
  ];

  for (const field of boolFields) {
    const value = parseBoolean((req.query as any)[field]);
    if (value !== undefined) {
      (query as any)[field] = value;
    }
  }

  try {
    const clips = await listClips(Object.keys(query).length ? query : undefined);
    res.json(clips);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const clip = await getClipById(req.params.id);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json(clip);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/:id", async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Body must be an object" });
  }
  try {
    const updated = await updateClip(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteClip(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/enrich", async (_req, res) => {
  try {
    const enriched = await enrichAllClips();
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post(
  "/select",
  validateBody(validateClipSelectPayload),
  async (req, res) => {
    const { experienceSettings } = req.body as ClipSelectPayload;
    try {
      const selected = await selectClipsForUserSession(
        req.userId,
        experienceSettings
      );
      res.json(selected);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

export default router;
