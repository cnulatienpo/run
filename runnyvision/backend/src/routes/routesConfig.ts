import { Router } from "express";
import type { RouteConfig } from "../types.js";

type Params = {
  routes: RouteConfig[];
};

export function createRoutesConfigRouter({ routes }: Params): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    return res.json(routes);
  });

  return router;
}
