import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { RunSession } from "../../../shared/types";
import { computeFakeMiles } from "../logic/computeFakeMiles";

type SaveRuns = (runs: RunSession[]) => void;

type Params = {
  runs: RunSession[];
  saveRuns: SaveRuns;
};

export function createRunsRouter({ runs, saveRuns }: Params): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const { userId, steps, places } = req.body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }
    if (typeof steps !== "number" || steps < 0) {
      return res.status(400).json({ error: "steps must be a non-negative number" });
    }
    if (!Array.isArray(places) || !places.every((p) => typeof p === "string")) {
      return res.status(400).json({ error: "places must be an array of strings" });
    }

    const id = uuidv4();
    const fakeMiles = computeFakeMiles(id, steps);
    const createdAt = new Date().toISOString();

    const run: RunSession = {
      id,
      userId,
      steps,
      places,
      fakeMiles,
      createdAt,
    };

    runs.push(run);
    saveRuns(runs);

    return res.status(201).json(run);
  });

  router.get("/", (_req, res) => {
    return res.json(runs);
  });

  return router;
}
