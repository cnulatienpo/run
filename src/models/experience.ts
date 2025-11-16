export type ExperienceFocusMode =
  | "GOAL"
  | "ESCAPE"
  | "MIX";

export type CameraMovementPreference =
  | "STILL_OK"
  | "MIXED"
  | "ALWAYS_MOVING";

export type LocationEnvironment =
  | "INDOOR"
  | "OUTDOOR"
  | "BOTH";

export type PeopleDensity =
  | "EMPTY"
  | "FEW"
  | "CROWDED"
  | "PACKED";

export type Urbanity =
  | "URBAN"
  | "SUBURBAN"
  | "RURAL"
  | "MIXED";

export type NaturalVsBuilt = "NATURE_HEAVY" | "BALANCED" | "BUILT_HEAVY";

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

export type TimeOfDay =
  | "MORNING"
  | "AFTERNOON"
  | "SUNSET"
  | "NIGHT"
  | "INDOORS_NO_TIME";

export type Atmosphere =
  | "CLEAR"
  | "FOG"
  | "RAIN"
  | "SNOW"
  | "NEON"
  | "LOW_LIGHT"
  | "OVERCAST";

export type MusicSyncMode =
  | "BPM"
  | "HEART_RATE"
  | "NONE"
  | "AUTO";

export type TrainingType =
  | "STAMINA"
  | "BOUNCE_ENDURANCE"
  | "SPEED_BURSTS"
  | "LONG_STEADY"
  | "MIXED_MODE";

export type FeedbackMode =
  | "SILENT"
  | "HEADS_UP"
  | "FULL_FEEDBACK";

export type ClipDurationPreference =
  | "SHORT"
  | "MEDIUM"
  | "LONG"
  | "MIXED";

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
  naturalVsBuilt: NaturalVsBuilt;

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

export const DEFAULT_EXPERIENCE_SETTINGS: ExperienceSettings = {
  focusMode: "MIX",
  cameraMovement: "MIXED",
  locationEnvironment: "BOTH",
  peopleDensity: "FEW",
  urbanity: "MIXED",
  naturalVsBuilt: "BALANCED",
  allowedSources: ["LIVE", "FILM_CLIP", "AI"],
  timeOfDay: [
    "MORNING",
    "AFTERNOON",
    "SUNSET",
    "NIGHT",
    "INDOORS_NO_TIME",
  ],
  atmosphere: ["CLEAR", "NEON", "LOW_LIGHT"],
  musicSyncMode: "AUTO",
  trainingType: "MIXED_MODE",
  heartRateBand: { mode: "AUTO" },
  progressView: "TIME_IN_ZONE",
  feedbackMode: "HEADS_UP",
  neverAskDuringRun: true,
  clipDurationPreference: "MIXED",
  noGoFilters: {
    staticCameras: false,
    cameraBob: false,
    runningOnlyPOV: false,
    talkingHeads: true,
    drivingPOV: false,
    droneFootage: false,
    selfieFootage: true,
    fastSpins: false,
    peopleSittingStill: true,
    gyms: false,
  },
};
