import { Router } from "express";
import { RunSession } from "../../../shared/types";

type Params = {
  runs: RunSession[];
};

export function createPassportRouter({ runs }: Params): Router {
  const router = Router();

  router.get("/:userId", (req, res) => {
    const { userId } = req.params;
    const filtered = runs
      .filter((run) => run.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json(filtered);
  });

  return router;
}
