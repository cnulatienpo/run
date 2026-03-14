declare module '../../../renderer/hallucinationEngine.js' {
  type EffectPackName = 'default' | 'fog' | 'dreamcore' | string;
  type MoodName = 'ambient' | 'rare' | 'glide' | 'dreamcore' | string;

  export function configureEffectPacks(config: {
    selectedPacks?: EffectPackName[];
    moodFilters?: Record<EffectPackName, Record<MoodName, boolean>>;
    packOverrides?: Record<string, unknown>;
  }): void;

  export function setEffectInterval(value: number): void;
  export function setRareChance(value: number): void;
  export function setIntensityMultiplier(value: number): void;
  export function updateBPM(value: number): void;
  export function exportSessionLog(): void;
  export function replaySession(data: unknown, speed?: number): void;
  export function recordTag(tag: string): void;
  export function clearRecentTags(): void;
  export function getRecentTags(limit?: number): string[];
}
