import { ExperienceSettings } from "../models/experience";
import { ExperienceProfile } from "../models/profile";
import { RunHistoryEntry, RunStats } from "../models/runStats";
import { compileSchema, JSONSchemaType } from "./ajvInstance";

export type RunTelemetryPayload = {
  heartRate?: number;
  inTargetZone?: boolean;
  deltaSeconds?: number;
};

export type RunStartPayload = {
  trainingType?: string;
  goalName?: string;
};

export interface CreateProfilePayload {
  name: string;
  settings: ExperienceSettings;
}

export interface UpdateProfilePayload {
  name?: string;
  settings?: ExperienceSettings;
}

export interface ClipSelectPayload {
  experienceSettings: ExperienceSettings;
}

const focusModeValues = ["GOAL", "ESCAPE", "MIX"] as const;
const cameraMovementValues = ["STILL_OK", "MIXED", "ALWAYS_MOVING"] as const;
const locationEnvironmentValues = ["INDOOR", "OUTDOOR", "BOTH"] as const;
const peopleDensityValues = ["EMPTY", "FEW", "CROWDED", "PACKED"] as const;
const urbanityValues = ["URBAN", "SUBURBAN", "RURAL", "MIXED"] as const;
const naturalVsBuiltValues = ["NATURE_HEAVY", "BALANCED", "BUILT_HEAVY"] as const;
const sourceFootageValues = [
  "LIVE",
  "VHS_RETRO",
  "FILM_CLIP",
  "ANIMATED",
  "GAME",
  "AI",
  "MUSIC_VIDEO",
  "CONCERT_WALKTHROUGH",
  "CLUB_WALKIN",
] as const;
const timeOfDayValues = [
  "MORNING",
  "AFTERNOON",
  "SUNSET",
  "NIGHT",
  "INDOORS_NO_TIME",
] as const;
const atmosphereValues = ["CLEAR", "FOG", "RAIN", "SNOW", "NEON", "LOW_LIGHT", "OVERCAST"] as const;
const musicSyncModeValues = ["BPM", "HEART_RATE", "NONE", "AUTO"] as const;
const trainingTypeValues = [
  "STAMINA",
  "BOUNCE_ENDURANCE",
  "SPEED_BURSTS",
  "LONG_STEADY",
  "MIXED_MODE",
] as const;
const feedbackModeValues = ["SILENT", "HEADS_UP", "FULL_FEEDBACK"] as const;
const clipDurationValues = ["SHORT", "MEDIUM", "LONG", "MIXED"] as const;
const progressViewValues = ["STREAKS", "TIME_IN_ZONE", "SEGMENTS", "MINIMAL"] as const;
const heartRateBandModes = ["ABOVE", "RANGE", "AUTO"] as const;

export const ExperienceSettingsSchema = {
  type: "object",
  properties: {
    focusMode: { type: "string", enum: focusModeValues },
    cameraMovement: { type: "string", enum: cameraMovementValues },
    locationEnvironment: { type: "string", enum: locationEnvironmentValues },
    peopleDensity: { type: "string", enum: peopleDensityValues },
    urbanity: { type: "string", enum: urbanityValues },
    naturalVsBuilt: { type: "string", enum: naturalVsBuiltValues },
    allowedSources: {
      type: "array",
      items: { type: "string", enum: sourceFootageValues },
    },
    timeOfDay: {
      type: "array",
      items: { type: "string", enum: timeOfDayValues },
    },
    atmosphere: {
      type: "array",
      items: { type: "string", enum: atmosphereValues },
    },
    musicSyncMode: { type: "string", enum: musicSyncModeValues },
    trainingType: { type: "string", enum: trainingTypeValues },
    heartRateBand: {
      type: "object",
      properties: {
        mode: { type: "string", enum: heartRateBandModes },
        min: { type: "number", nullable: true },
        max: { type: "number", nullable: true },
      },
      required: ["mode"],
      additionalProperties: false,
    },
    progressView: { type: "string", enum: progressViewValues },
    feedbackMode: { type: "string", enum: feedbackModeValues },
    neverAskDuringRun: { type: "boolean" },
    clipDurationPreference: { type: "string", enum: clipDurationValues },
    noGoFilters: {
      type: "object",
      properties: {
        staticCameras: { type: "boolean" },
        cameraBob: { type: "boolean" },
        runningOnlyPOV: { type: "boolean" },
        talkingHeads: { type: "boolean" },
        drivingPOV: { type: "boolean" },
        droneFootage: { type: "boolean" },
        selfieFootage: { type: "boolean" },
        fastSpins: { type: "boolean" },
        peopleSittingStill: { type: "boolean" },
        gyms: { type: "boolean" },
      },
      required: [
        "staticCameras",
        "cameraBob",
        "runningOnlyPOV",
        "talkingHeads",
        "drivingPOV",
        "droneFootage",
        "selfieFootage",
        "fastSpins",
        "peopleSittingStill",
        "gyms",
      ],
      additionalProperties: false,
    },
    profileName: { type: "string" },
  },
  required: [
    "focusMode",
    "cameraMovement",
    "locationEnvironment",
    "peopleDensity",
    "urbanity",
    "naturalVsBuilt",
    "allowedSources",
    "timeOfDay",
    "atmosphere",
    "musicSyncMode",
    "progressView",
    "feedbackMode",
    "neverAskDuringRun",
    "clipDurationPreference",
    "noGoFilters",
  ],
  additionalProperties: false,
};

export const ExperienceProfileSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    userId: { type: "string" },
    name: { type: "string" },
    settings: ExperienceSettingsSchema as any,
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["id", "userId", "name", "settings", "createdAt", "updatedAt"],
  additionalProperties: false,
};

export const RunHistoryEntrySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    date: { type: "string" },
    durationSeconds: { type: "number" },
    timeInTargetZoneSeconds: { type: "number" },
    longestStreakSeconds: { type: "number" },
    trainingType: { type: "string", nullable: true },
    goalName: { type: "string", nullable: true },
  },
  required: [
    "id",
    "date",
    "durationSeconds",
    "timeInTargetZoneSeconds",
    "longestStreakSeconds",
  ],
  additionalProperties: false,
};

export const RunStatsSchema = {
  type: "object",
  properties: {
    currentHeartRate: { type: "number", nullable: true },
    timeInTargetZoneSeconds: { type: "number" },
    longestStreakSeconds: { type: "number" },
    sessionDurationSeconds: { type: "number" },
    currentGoalName: { type: "string", nullable: true },
    bounceEnduranceMinutes: { type: "number", nullable: true },
    history: {
      type: "array",
      items: RunHistoryEntrySchema as any,
    },
  },
  required: [
    "currentHeartRate",
    "timeInTargetZoneSeconds",
    "longestStreakSeconds",
    "sessionDurationSeconds",
    "history",
  ],
  additionalProperties: false,
};

export const RunTelemetryPayloadSchema = {
  type: "object",
  properties: {
    heartRate: { type: "number", nullable: true },
    inTargetZone: { type: "boolean", nullable: true },
    deltaSeconds: { type: "number", minimum: 0, nullable: true },
  },
  required: [],
  additionalProperties: false,
};

export const RunStartPayloadSchema = {
  type: "object",
  properties: {
    trainingType: { type: "string", nullable: true },
    goalName: { type: "string", nullable: true },
  },
  required: [],
  additionalProperties: false,
};

const CreateProfilePayloadSchema = {
  type: "object",
  properties: {
    name: { type: "string", pattern: ".*\\S.*" },
    settings: ExperienceSettingsSchema as any,
  },
  required: ["name", "settings"],
  additionalProperties: false,
};

const UpdateProfilePayloadSchema = {
  type: "object",
  properties: {
    name: { type: "string", pattern: ".*\\S.*", nullable: true },
    settings: ExperienceSettingsSchema as any,
  },
  required: [],
  additionalProperties: false,
  minProperties: 1,
};

const ClipSelectPayloadSchema = {
  type: "object",
  properties: {
    experienceSettings: ExperienceSettingsSchema as any,
  },
  required: ["experienceSettings"],
  additionalProperties: false,
};

export const validateExperienceSettings = compileSchema(ExperienceSettingsSchema);
export const validateExperienceProfile = compileSchema(ExperienceProfileSchema);
export const validateRunHistoryEntry = compileSchema(RunHistoryEntrySchema);
export const validateRunStats = compileSchema(RunStatsSchema);
export const validateRunTelemetryPayload = compileSchema(RunTelemetryPayloadSchema);
export const validateRunStartPayload = compileSchema(RunStartPayloadSchema);
export const validateCreateProfilePayload = compileSchema(CreateProfilePayloadSchema);
export const validateUpdateProfilePayload = compileSchema(UpdateProfilePayloadSchema);
export const validateClipSelectPayload = compileSchema(ClipSelectPayloadSchema);
