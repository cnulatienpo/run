/**
 * ============================================================
 *  CLIP LIBRARY – ENRICHMENT SERVICE
 * ------------------------------------------------------------
 *  Role:
 *    - Infers clip metadata:
 *        * CTA / Sponsor detection
 *        * Environment tagging (club, game, night, rural, city)
 *        * Urbanity + indoor/outdoor flags
 *
 *  Pipeline:
 *    - detectCtaForClip(clip)
 *    - inferTagsForClip(clip)
 *    - enrichAllClips() → updates stored clips via clipLibraryService
 *
 *  Notes:
 *    - Pure data transformation (no I/O except via service calls)
 *    - Called by POST /api/clips/enrich
 * ============================================================
 */

import {
  CTA_BRAND_KEYWORDS,
  CTA_SOCIAL_KEYWORDS,
  CTA_TEXT_PATTERNS,
} from "../config/ctaFilter";
import { ClipMetadata } from "../models/clip";
import { getAllClips, updateClip } from "./clipLibraryService";

const CLUB_KEYWORDS = ["club", "disco", "dj", "warehouse", "rave"];
const NIGHT_KEYWORDS = ["night", "neon", "late", "midnight", "after hours"];
const CITY_KEYWORDS = ["city", "downtown", "street", "urban", "metro", "skyline"];
const SUBURB_KEYWORDS = ["suburb", "suburban", "neighborhood", "residential"];
const RURAL_KEYWORDS = ["park", "trail", "forest", "mountain", "valley", "nature"];
const GAME_KEYWORDS = [
  "game",
  "gameplay",
  "gta",
  "fortnite",
  "minecraft",
  "cyberpunk",
  "need for speed",
  "forza",
  "apex",
];
const INDOOR_KEYWORDS = ["gym", "studio", "hall", "warehouse", "tunnel", "club"];

function includesKeyword(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function detectCtaForClip(clip: ClipMetadata): ClipMetadata {
  const haystack = (
    (clip.transcript || "") +
    " " +
    (clip.ocrText || "") +
    " " +
    (clip.description || "") +
    " " +
    clip.tags.join(" ")
  ).toLowerCase();

  const hitText = CTA_TEXT_PATTERNS.some((pattern) =>
    haystack.includes(pattern.toLowerCase())
  );
  const hitBrand = CTA_BRAND_KEYWORDS.some((pattern) =>
    haystack.includes(pattern.toLowerCase())
  );
  const hitSocial = CTA_SOCIAL_KEYWORDS.some((pattern) =>
    haystack.includes(pattern.toLowerCase())
  );

  return {
    ...clip,
    hasCtaOrSponsor: hitText || hitBrand || hitSocial,
  };
}

export function inferTagsForClip(clip: ClipMetadata): ClipMetadata {
  const haystack = (
    clip.urlOrPath +
    " " +
    (clip.title || "") +
    " " +
    (clip.description || "")
  ).toLowerCase();

  const tags = new Set(clip.tags || []);
  const updated: ClipMetadata = { ...clip, tags: Array.from(tags) };

  if (includesKeyword(haystack, CLUB_KEYWORDS)) {
    tags.add("club-walkin");
    updated.isClubLike = true;
    updated.environment = updated.environment ?? "INDOOR";
  }

  if (includesKeyword(haystack, NIGHT_KEYWORDS)) {
    updated.isNight = true;
    tags.add("urban-night");
  }

  if (includesKeyword(haystack, GAME_KEYWORDS)) {
    updated.isGameEnvironment = true;
    updated.isAnimated = true;
    tags.add("game-env");
  }

  if (includesKeyword(haystack, CITY_KEYWORDS)) {
    updated.urbanity = "URBAN";
    updated.environment = updated.environment ?? "OUTDOOR";
  }

  if (includesKeyword(haystack, SUBURB_KEYWORDS)) {
    updated.urbanity = "SUBURBAN";
    updated.environment = updated.environment ?? "OUTDOOR";
  }

  if (includesKeyword(haystack, RURAL_KEYWORDS)) {
    updated.urbanity = "RURAL";
    updated.environment = "OUTDOOR";
    tags.add("nature-trail");
  }

  if (includesKeyword(haystack, INDOOR_KEYWORDS)) {
    updated.environment = updated.environment ?? "INDOOR";
  }

  updated.tags = Array.from(tags);
  return updated;
}

export async function enrichAllClips(): Promise<ClipMetadata[]> {
  const clips = await getAllClips();
  const enriched: ClipMetadata[] = [];

  for (const clip of clips) {
    const inferred = inferTagsForClip(clip);
    const detected = detectCtaForClip(inferred);
    const saved = await updateClip(detected.id, {
      tags: detected.tags,
      environment: detected.environment,
      urbanity: detected.urbanity,
      isNight: detected.isNight,
      isAnimated: detected.isAnimated,
      isGameEnvironment: detected.isGameEnvironment,
      isClubLike: detected.isClubLike,
      hasCtaOrSponsor: detected.hasCtaOrSponsor,
    });
    enriched.push(saved ?? detected);
  }

  return enriched;
}
