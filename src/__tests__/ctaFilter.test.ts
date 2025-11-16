import { beforeEach, describe, expect, test } from "vitest";
import {
  CTA_BRAND_KEYWORDS,
  CTA_SOCIAL_KEYWORDS,
  CTA_TEXT_PATTERNS,
} from "../config/ctaFilter";
import { removeCtaAndSponsorClips } from "../services/clipSelectionService";
import { ClipMetadata } from "../models/clip";

let clipCounter = 0;

function makeClip(overrides: Partial<ClipMetadata>): ClipMetadata {
  clipCounter += 1;
  const now = new Date(2024, 0, 1 + clipCounter).toISOString();
  return {
    id: `clip-${clipCounter}`,
    sourceType: "YOUTUBE",
    urlOrPath: `https://example.com/${clipCounter}`,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ClipMetadata;
}

describe("CTA filtering", () => {
  beforeEach(() => {
    clipCounter = 0;
  });
  test("removes clips with explicit CTA transcripts", () => {
    const ctaPhrase = CTA_TEXT_PATTERNS[0] ?? "like and subscribe";
    const clips = [makeClip({ transcript: ctaPhrase })];
    const filtered = removeCtaAndSponsorClips(clips);
    expect(filtered).toHaveLength(0);
  });

  test("removes clips with sponsor disclosures in descriptions", () => {
    const description = `This video is sponsored by ${CTA_BRAND_KEYWORDS[0] ?? "nordvpn"}.`;
    const clips = [makeClip({ description })];
    const filtered = removeCtaAndSponsorClips(clips);
    expect(filtered).toHaveLength(0);
  });

  test("removes clips when tags mention known sponsors or social promos", () => {
    const sponsorTag = CTA_BRAND_KEYWORDS[CTA_BRAND_KEYWORDS.length - 1] ?? "raid shadow legends";
    const socialTag = CTA_SOCIAL_KEYWORDS[0] ?? "instagram";
    const clips = [
      makeClip({ tags: ["relaxing", sponsorTag] }),
      makeClip({ tags: ["urban", socialTag] }),
    ];
    const filtered = removeCtaAndSponsorClips(clips);
    expect(filtered).toHaveLength(0);
  });

  test("respects hasCtaOrSponsor flag", () => {
    const clips = [makeClip({ hasCtaOrSponsor: true })];
    const filtered = removeCtaAndSponsorClips(clips);
    expect(filtered).toHaveLength(0);
  });

  test("keeps clean descriptive clips", () => {
    const cleanClips = [
      makeClip({
        title: "Nature walk",
        description: "Peaceful forest ambient recording",
        tags: ["nature", "relaxing"],
      }),
      makeClip({
        title: "Urban walk",
        description: "Exploring downtown architecture",
        tags: ["city", "tour"],
      }),
    ];

    const filtered = removeCtaAndSponsorClips(cleanClips);
    expect(filtered).toHaveLength(cleanClips.length);
    expect(filtered.map((clip) => clip.id)).toEqual(
      cleanClips.map((clip) => clip.id)
    );
  });
});
