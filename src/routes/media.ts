// src/routes/media.ts
// ============================================================
// Media routes — download access only
// This route does NOT handle uploads.
// It only returns signed, time-limited URLs for private media.
// ============================================================

import { Router, Request, Response } from "express";
import { getSignedDownloadUrl } from "../storage/b2Client";

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
 * Fetches the manifest_v1.json file from the bucket root
 */
router.get("/manifest", async (_req: Request, res: Response) => {
  try {
    const manifestPath = "manifest_v1.json";
    const url = await getSignedDownloadUrl(manifestPath, 60);
    
    // Fetch the manifest content
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.statusText}`);
    }
    
    const manifest = await response.json();
    return res.json(manifest);
  } catch (err: any) {
    console.error("[media] manifest error:", err);
    return res.status(500).json({
      error: "Failed to fetch manifest",
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
    
    // If atom has a video_url or similar field, generate a signed URL for it
    const videoFileName = atomMeta?.video_url || atomMeta?.videoUrl || atomMeta?.segment_url;
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
