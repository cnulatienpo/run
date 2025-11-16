import { ExperienceSettings } from "../models/experience";
import { ClipMetadata } from "../models/clip";
import { ClipQuery, listClips } from "./clipLibraryService";
import {
  CTA_BRAND_KEYWORDS,
  CTA_FILTER_ENABLED,
  CTA_SOCIAL_KEYWORDS,
  CTA_TEXT_PATTERNS,
} from "../config/ctaFilter";

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
  return clips.filter((clip) => {
    if (
      settings.locationEnvironment === "INDOOR" &&
      clip.environment === "OUTDOOR"
    ) {
      return false;
    }
    if (
      settings.locationEnvironment === "OUTDOOR" &&
      clip.environment === "INDOOR"
    ) {
      return false;
    }
    if (
      settings.urbanity !== "MIXED" &&
      clip.urbanity &&
      clip.urbanity !== settings.urbanity
    ) {
      return false;
    }
    if (
      clip.peopleDensity &&
      clip.peopleDensity !== settings.peopleDensity
    ) {
      return false;
    }
    return true;
  });
}

export function removeCtaAndSponsorClips(
  clips: ClipMetadata[]
): ClipMetadata[] {
  if (!CTA_FILTER_ENABLED) return clips;

  return clips.filter((clip) => {
    if (clip.hasCtaOrSponsor) {
      return false;
    }
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

  return filteredNoCta.map((clip) => ({
    id: clip.id,
    url: clip.urlOrPath,
    startSeconds: 0,
    endSeconds: clip.durationSeconds ?? 300,
  }));
}

function buildQueryFromSettings(settings: ExperienceSettings): ClipQuery {
  const query: ClipQuery = {
    excludeCtaOrSponsor: true,
  };

  if (settings.locationEnvironment === "INDOOR") {
    query.environment = "INDOOR";
  } else if (settings.locationEnvironment === "OUTDOOR") {
    query.environment = "OUTDOOR";
  }

  if (settings.peopleDensity) {
    query.peopleDensity = settings.peopleDensity;
  }

  if (settings.urbanity && settings.urbanity !== "MIXED") {
    query.urbanity = settings.urbanity;
  }

  const allowsGame = settings.allowedSources?.includes("GAME");
  if (allowsGame && settings.allowedSources?.length === 1) {
    query.isGameEnvironment = true;
  } else if (settings.allowedSources && !allowsGame) {
    query.isGameEnvironment = false;
  }

  const wantsClubLike =
    settings.trainingType === "BOUNCE_ENDURANCE" ||
    settings.allowedSources?.includes("CLUB_WALKIN");
  if (wantsClubLike) {
    query.isClubLike = true;
  }

  return query;
}

export async function selectClipsForUserSession(
  userId: string,
  settings: ExperienceSettings
): Promise<SelectedClip[]> {
  const query = buildQueryFromSettings(settings);
  const clips = await listClips(query);
  if (process.env.NODE_ENV !== "test") {
    console.debug(
      `[clip-selection] selecting ${clips.length} clips for ${userId}`
    );
  }
  return selectClipsForSession(clips, settings);
}
