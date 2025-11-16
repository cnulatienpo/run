export type ExperienceFocusMode = "GOAL" | "ESCAPE" | "MIX";

export type CameraMovementPreference = "STILL_OK" | "MIXED" | "ALWAYS_MOVING";

export type LocationEnvironment = "INDOOR" | "OUTDOOR" | "BOTH";

export type PeopleDensity = "EMPTY" | "FEW" | "CROWDED" | "PACKED";

export type Urbanity = "URBAN" | "SUBURBAN" | "RURAL" | "MIXED";

export type SourceFootageType =
  | "LIVE"
  | "VHS_RETRO"
  | "FILM_CLIP"
  | "ANIMATED"
  | "GAME"
  | "AI"
  | "MUSIC_VIDEO"
  | "CONCERT_WALKTHROUGH"
  | "CLUB_WALKIN";

export type TimeOfDay = "MORNING" | "AFTERNOON" | "SUNSET" | "NIGHT" | "INDOORS_NO_TIME";

export type Atmosphere =
  | "CLEAR"
  | "FOG"
  | "RAIN"
  | "SNOW"
  | "NEON"
  | "LOW_LIGHT"
  | "OVERCAST";

export type MusicSyncMode = "BPM" | "HEART_RATE" | "NONE" | "AUTO";

export type TrainingType =
  | "STAMINA"
  | "BOUNCE_ENDURANCE"
  | "SPEED_BURSTS"
  | "LONG_STEADY"
  | "MIXED_MODE";

export type FeedbackMode = "SILENT" | "HEADS_UP" | "FULL_FEEDBACK";

export type ClipDurationPreference = "SHORT" | "MEDIUM" | "LONG" | "MIXED";

export interface NoGoFilters {
  staticCameras: boolean;
  cameraBob: boolean;
  runningOnlyPOV: boolean;
  talkingHeads: boolean;
  drivingPOV: boolean;
  droneFootage: boolean;
  selfieFootage: boolean;
  fastSpins: boolean;
  peopleSittingStill: boolean;
  gyms: boolean;
}

export interface HeartRateBand {
  mode: "ABOVE" | "RANGE" | "AUTO";
  min?: number;
  max?: number;
}

export interface ExperienceSettings {
  focusMode: ExperienceFocusMode;
  cameraMovement: CameraMovementPreference;

  locationEnvironment: LocationEnvironment;
  peopleDensity: PeopleDensity;
  urbanity: Urbanity;
  naturalVsBuilt: "NATURE_HEAVY" | "BALANCED" | "BUILT_HEAVY";

  allowedSources: SourceFootageType[];

  timeOfDay: TimeOfDay[];
  atmosphere: Atmosphere[];

  musicSyncMode: MusicSyncMode;

  trainingType?: TrainingType;
  heartRateBand?: HeartRateBand;
  progressView: "STREAKS" | "TIME_IN_ZONE" | "SEGMENTS" | "MINIMAL";

  feedbackMode: FeedbackMode;
  neverAskDuringRun: boolean;

  clipDurationPreference: ClipDurationPreference;

  noGoFilters: NoGoFilters;

  profileName?: string;
}

export interface ExperienceProfile {
  id: string;
  name: string;
  settings: ExperienceSettings;
}

export interface RunStats {
  currentHeartRate: number | null;
  timeInTargetZoneSeconds: number;
  longestStreakSeconds: number;
  sessionDurationSeconds: number;
  currentGoalName?: string;
  bounceEnduranceMinutes?: number;
  history?: Array<{
    date: string;
    durationSeconds: number;
    timeInTargetZoneSeconds: number;
    longestStreakSeconds: number;
  }>;
}

const DEFAULT_ALLOWED_SOURCES: SourceFootageType[] = [
  "LIVE",
  "VHS_RETRO",
  "FILM_CLIP",
  "ANIMATED",
  "GAME",
  "AI",
  "MUSIC_VIDEO",
  "CONCERT_WALKTHROUGH",
  "CLUB_WALKIN",
];

const DEFAULT_TIME_OF_DAY: TimeOfDay[] = [
  "MORNING",
  "AFTERNOON",
  "SUNSET",
  "NIGHT",
  "INDOORS_NO_TIME",
];

const DEFAULT_ATMOSPHERE: Atmosphere[] = [
  "CLEAR",
  "NEON",
  "LOW_LIGHT",
  "OVERCAST",
];

export const DEFAULT_EXPERIENCE_SETTINGS: ExperienceSettings = {
  focusMode: "GOAL",
  cameraMovement: "MIXED",
  locationEnvironment: "BOTH",
  peopleDensity: "FEW",
  urbanity: "MIXED",
  naturalVsBuilt: "BALANCED",
  allowedSources: DEFAULT_ALLOWED_SOURCES,
  timeOfDay: DEFAULT_TIME_OF_DAY,
  atmosphere: DEFAULT_ATMOSPHERE,
  musicSyncMode: "AUTO",
  trainingType: "STAMINA",
  heartRateBand: {
    mode: "RANGE",
    min: 135,
    max: 158,
  },
  progressView: "TIME_IN_ZONE",
  feedbackMode: "HEADS_UP",
  neverAskDuringRun: true,
  clipDurationPreference: "MEDIUM",
  noGoFilters: {
    staticCameras: true,
    cameraBob: false,
    runningOnlyPOV: true,
    talkingHeads: true,
    drivingPOV: true,
    droneFootage: false,
    selfieFootage: true,
    fastSpins: true,
    peopleSittingStill: true,
    gyms: true,
  },
  profileName: "Baseline Flow",
};

export const MOCK_RUN_STATS: RunStats = {
  currentHeartRate: 148,
  timeInTargetZoneSeconds: 1520,
  longestStreakSeconds: 620,
  sessionDurationSeconds: 2700,
  currentGoalName: "Stamina build",
  bounceEnduranceMinutes: 12,
  history: [
    {
      date: "2024-06-18",
      durationSeconds: 2400,
      timeInTargetZoneSeconds: 1320,
      longestStreakSeconds: 540,
    },
    {
      date: "2024-06-16",
      durationSeconds: 1800,
      timeInTargetZoneSeconds: 900,
      longestStreakSeconds: 480,
    },
    {
      date: "2024-06-14",
      durationSeconds: 3200,
      timeInTargetZoneSeconds: 1980,
      longestStreakSeconds: 780,
    },
  ],
};
