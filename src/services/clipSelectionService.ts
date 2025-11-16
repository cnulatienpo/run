import { ExperienceSettings } from "../models/experience";
import {
  CTA_BRAND_KEYWORDS,
  CTA_FILTER_ENABLED,
  CTA_SOCIAL_KEYWORDS,
  CTA_TEXT_PATTERNS,
} from "../config/ctaFilter";

export interface ClipMetadata {
  id: string;
  url: string;
  durationSeconds: number;
  sourceType: string; // "YOUTUBE", "LOCAL", etc.
  transcript?: string;
  ocrText?: string;
  tags?: string[];
  hasSponsor?: boolean;
}

export interface SelectedClip {
  id: string;
  url: string;
  startSeconds: number;
  endSeconds: number;
}

export function filterClipsByExperience(
  clips: ClipMetadata[],
  settings: ExperienceSettings
): ClipMetadata[] {
  // TODO: filter by location, people density, cameraMovement, allowedSources, etc.
  // For now, just return the input array.
  return clips;
}

export function removeCtaAndSponsorClips(
  clips: ClipMetadata[]
): ClipMetadata[] {
  if (!CTA_FILTER_ENABLED) return clips;

  return clips.filter((clip) => {
    const haystack = (
      (clip.transcript || "") +
      " " +
      (clip.ocrText || "") +
      " " +
      (clip.tags || []).join(" ")
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

    if (clip.hasSponsor) return false;
    if (hitText || hitBrand || hitSocial) return false;

    return true;
  });
}

export function selectClipsForSession(
  availableClips: ClipMetadata[],
  settings: ExperienceSettings
): SelectedClip[] {
  const filteredByExperience = filterClipsByExperience(availableClips, settings);
  const filteredNoCta = removeCtaAndSponsorClips(filteredByExperience);

  // TODO: sort or pick a sequence based on HR, clipDurationPreference, etc.
  // For now, just map all remaining clips into SelectedClip with full duration.
  return filteredNoCta.map((clip) => ({
    id: clip.id,
    url: clip.url,
    startSeconds: 0,
    endSeconds: clip.durationSeconds,
  }));
}
