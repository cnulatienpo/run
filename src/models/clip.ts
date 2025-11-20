/**
 * Divergence Note:
 * ClipMetadata is NOT compatible with Deck/Mnemonic models.
 * No automatic sync or adapter exists.
 */

export type ClipSourceType = "YOUTUBE" | "LOCAL" | "GAME_CAPTURE";

export interface ClipMetadata {
  id: string;
  sourceType: ClipSourceType;
  urlOrPath: string;
  durationSeconds?: number;
  title?: string;
  description?: string;
  tags: string[];
  hasCtaOrSponsor?: boolean;
  transcript?: string;
  ocrText?: string;
  environment?: "INDOOR" | "OUTDOOR";
  peopleDensity?: "EMPTY" | "FEW" | "CROWDED" | "PACKED";
  urbanity?: "URBAN" | "SUBURBAN" | "RURAL" | "MIXED";
  isNight?: boolean;
  isAnimated?: boolean;
  isGameEnvironment?: boolean;
  isClubLike?: boolean;
  createdAt: string;
  updatedAt: string;
}
