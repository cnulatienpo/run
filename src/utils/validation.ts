import { ExperienceSettings } from "../models/experience";

export interface ValidationResult<T> {
  valid: boolean;
  errors?: string[];
  data?: T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateExperienceSettings(
  payload: unknown
): ValidationResult<ExperienceSettings> {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ["Body must be an object"] };
  }

  const requiredStringFields = [
    "focusMode",
    "cameraMovement",
    "locationEnvironment",
    "peopleDensity",
    "urbanity",
    "naturalVsBuilt",
    "musicSyncMode",
    "progressView",
    "feedbackMode",
    "clipDurationPreference",
  ];

  requiredStringFields.forEach((field) => {
    if (typeof (payload as Record<string, unknown>)[field] !== "string") {
      errors.push(`${field} must be a string`);
    }
  });

  const arrayFields = ["allowedSources", "timeOfDay", "atmosphere"];
  arrayFields.forEach((field) => {
    if (!Array.isArray((payload as Record<string, unknown>)[field])) {
      errors.push(`${field} must be an array`);
    }
  });

  if (typeof (payload as Record<string, unknown>)["neverAskDuringRun"] !== "boolean") {
    errors.push("neverAskDuringRun must be a boolean");
  }

  const noGo = (payload as Record<string, unknown>)["noGoFilters"];
  if (!isObject(noGo)) {
    errors.push("noGoFilters must be an object");
  } else {
    Object.entries(noGo).forEach(([key, value]) => {
      if (typeof value !== "boolean") {
        errors.push(`noGoFilters.${key} must be a boolean`);
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: payload as ExperienceSettings };
}

export function validateProfilePayload(payload: unknown): ValidationResult<{
  name: string;
  settings: ExperienceSettings;
}> {
  if (!isObject(payload)) {
    return { valid: false, errors: ["Body must be an object"] };
  }

  if (typeof payload.name !== "string" || !payload.name.trim()) {
    return { valid: false, errors: ["name is required"] };
  }

  const settingsResult = validateExperienceSettings(payload.settings);
  if (!settingsResult.valid || !settingsResult.data) {
    return {
      valid: false,
      errors: settingsResult.errors ?? ["Invalid experience settings"],
    };
  }

  return { valid: true, data: { name: payload.name.trim(), settings: settingsResult.data } };
}

export function validateTelemetryPayload(payload: unknown): ValidationResult<{
  heartRate?: number;
  inTargetZone?: boolean;
  deltaSeconds?: number;
}> {
  if (!isObject(payload)) {
    return { valid: false, errors: ["Body must be an object"] };
  }

  const errors: string[] = [];
  const result: { heartRate?: number; inTargetZone?: boolean; deltaSeconds?: number } = {};

  if ("heartRate" in payload) {
    if (typeof payload.heartRate !== "number" || Number.isNaN(payload.heartRate)) {
      errors.push("heartRate must be a number");
    } else {
      result.heartRate = payload.heartRate;
    }
  }

  if ("inTargetZone" in payload) {
    if (typeof payload.inTargetZone !== "boolean") {
      errors.push("inTargetZone must be a boolean");
    } else {
      result.inTargetZone = payload.inTargetZone;
    }
  }

  if ("deltaSeconds" in payload) {
    if (
      typeof payload.deltaSeconds !== "number" ||
      Number.isNaN(payload.deltaSeconds) ||
      payload.deltaSeconds < 0
    ) {
      errors.push("deltaSeconds must be a non-negative number");
    } else {
      result.deltaSeconds = payload.deltaSeconds;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: result };
}
