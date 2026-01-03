// src/routes/media.ts
// ============================================================
// Media routes — download access only
// This route does NOT handle uploads.
// It only returns signed, time-limited URLs for private media.
// ============================================================

import { Router, Request, Response } from "express";
import { getSignedDownloadUrl } from "../storage/b2Client";
import { readFileSync } from "fs";
import { join } from "path";

const router = Router();

/**
 * GET /api/media/download-url?fileName=...
 *
 * Returns a short-lived signed URL for a private B2 object.
 */
router.get("/download-url", async (req: Request, res: Response) => {
  try {
    const fileName = req.query.fileName as string | undefined;

    if (!fileName) {
      return res.status(400).json({
        error: "Missing required query parameter: fileName",
      });
    }

    const url = await getSignedDownloadUrl(fileName, 60);

    return res.json({ url });
  } catch (err: any) {
    console.error("[media] download-url error:", err);
    return res.status(500).json({
      error: "Failed to generate download URL",
    });
  }
});

/**
 * GET /api/media/manifest
 *
 * Serves the local manifest_v1.json file from backend/
 */
router.get("/manifest", (_req: Request, res: Response) => {
  try {
    // Read manifest from local backend directory
    const manifestPath = join(__dirname, "../../backend/manifest_v1.json");
    const manifestData = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestData);
    
    return res.json(manifest);
  } catch (err: any) {
    console.error("[media] manifest error:", err);
    return res.status(500).json({
      error: "Failed to read local manifest",
      details: err.message,
    });
  }
});

/**
 * GET /api/media/atom?path=atoms/video_name/chunk_0001_v1.json
 *
 * Fetches an atom metadata JSON file and returns it with a signed video URL
 */
router.get("/atom", async (req: Request, res: Response) => {
  try {
    const atomPath = req.query.path as string | undefined;

    if (!atomPath) {
      return res.status(400).json({
        error: "Missing required query parameter: path",
      });
    }

    // Fetch the atom JSON
    const jsonUrl = await getSignedDownloadUrl(atomPath, 60);
    const response = await fetch(jsonUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch atom: ${response.statusText}`);
    }
    
    const atomMeta = await response.json();
    
    // Generate signed URL for the video file referenced in the atom
    const videoFileName = atomMeta?.video || atomMeta?.video_url || atomMeta?.videoUrl || atomMeta?.segment_url;
    if (videoFileName) {
      atomMeta.signed_url = await getSignedDownloadUrl(videoFileName, 300); // 5 minute expiry for video
    }

    return res.json(atomMeta);
  } catch (err: any) {
    console.error("[media] atom error:", err);
    return res.status(500).json({
      error: "Failed to fetch atom metadata",
    });
  }
});

export default router;
