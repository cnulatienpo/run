import { Router } from "express";
import { RouteConfig } from "../../../shared/types";

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
