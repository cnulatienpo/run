import { beforeEach, describe, expect, test } from "vitest";
import { ClipMetadata } from "../models/clip";
import { detectCtaForClip, inferTagsForClip } from "../services/clipEnrichmentService";

let counter = 0;
function createClip(overrides: Partial<ClipMetadata>): ClipMetadata {
  counter += 1;
  const now = new Date(2024, 1, counter).toISOString();
  return {
    id: `clip-${counter}`,
    sourceType: "YOUTUBE",
    urlOrPath: `https://cdn.example.com/${counter}.mp4`,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ClipMetadata;
}

describe("clipEnrichmentService", () => {
  beforeEach(() => {
    counter = 0;
  });
  test("infers club walk-in metadata", () => {
    const clip = createClip({
      title: "Walking into the disco club 1978",
    });

    const enriched = inferTagsForClip(clip);
    expect(enriched.isClubLike).toBe(true);
    expect(enriched.tags).toContain("club-walkin");
    expect(enriched.environment).toBe("INDOOR");
  });

  test("flags night-time urban scenes", () => {
    const clip = createClip({
      description: "City lights at night with neon reflections",
    });

    const enriched = inferTagsForClip(clip);
    expect(enriched.isNight).toBe(true);
    expect(enriched.tags).toContain("urban-night");
    expect(enriched.urbanity).toBe("URBAN");
  });

  test("detects game environments from url", () => {
    const clip = createClip({
      urlOrPath: "https://cdn.example.com/gameplay/cyberpunk-run.mp4",
      title: "Gameplay capture",
    });

    const enriched = inferTagsForClip(clip);
    expect(enriched.isGameEnvironment).toBe(true);
    expect(enriched.isAnimated).toBe(true);
    expect(enriched.tags).toContain("game-env");
  });

  test("detectCtaForClip marks sponsor phrasing", () => {
    const clip = createClip({
      description: "This video is sponsored by NordVPN.",
    });

    const detected = detectCtaForClip(clip);
    expect(detected.hasCtaOrSponsor).toBe(true);
  });
});
