import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { RouteConfig } from "../types.js";

type SaveRoutes = (routes: RouteConfig[]) => void;

type Params = {
  routes: RouteConfig[];
  saveRoutes: SaveRoutes;
};

export function createCreatorRouter({ routes, saveRoutes }: Params): Router {
  const router = Router();

  router.post("/routes", (req, res) => {
    const { name, videoUrl, places } = req.body || {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    if (!videoUrl || typeof videoUrl !== "string") {
      return res.status(400).json({ error: "videoUrl is required" });
    }
    if (!Array.isArray(places) || !places.every((p) => typeof p === "string")) {
      return res.status(400).json({ error: "places must be an array of strings" });
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    const route: RouteConfig = {
      id,
      name,
      videoUrl,
      places,
      createdAt,
    };

    routes.push(route);
    saveRoutes(routes);

    return res.status(201).json(route);
  });

  router.get("/routes", (_req, res) => {
    return res.json(routes);
  });

  return router;
}
