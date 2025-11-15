// src/passport/stats.ts
import { PassportStamp } from "./types";

export interface PassportStats {
  totalSessions: number;
  totalMiles: number;
  favoritePack: string | null;
}

export function computePassportStats(stamps: PassportStamp[]): PassportStats {
  const totalSessions = stamps.length;
  const totalMiles = stamps.reduce((sum, s) => sum + (s.miles || 0), 0);

  const packCounts: Record<string, number> = {};
  for (const s of stamps) {
    if (!s.pack) continue;
    packCounts[s.pack] = (packCounts[s.pack] || 0) + 1;
  }

  let favoritePack: string | null = null;
  let maxCount = 0;
  for (const [pack, count] of Object.entries(packCounts)) {
    if (count > maxCount) {
      favoritePack = pack;
      maxCount = count;
    }
  }

  return {
    totalSessions,
    totalMiles,
    favoritePack,
  };
}
