import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";

type JsonStore = Map<string, unknown>;

const fileStore: JsonStore = new Map();

vi.mock("../utils/jsonStore", () => {
  return {
    ensureFile: vi.fn(async (filePath: string, defaultValue: unknown) => {
      if (!fileStore.has(filePath)) {
        fileStore.set(filePath, defaultValue);
      }
    }),
    readJson: vi.fn(async (filePath: string) => {
      return (fileStore.get(filePath) ?? {}) as unknown;
    }),
    writeJson: vi.fn(async (filePath: string, data: unknown) => {
      fileStore.set(filePath, data);
    }),
  };
});

async function importService() {
  return await import("../services/runStatsService");
}

describe("runStatsService", () => {
  beforeEach(async () => {
    fileStore.clear();
    await vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("startSession initializes state with training metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    const service = await importService();
    await service.startSession("user-1", "BOUNCE_ENDURANCE", "Club Goal");
    const stats = await service.getRunStats("user-1");

    expect(stats.currentHeartRate).toBeNull();
    expect(stats.timeInTargetZoneSeconds).toBe(0);
    expect(stats.sessionDurationSeconds).toBe(0);
    expect(stats.history).toHaveLength(0);
    expect(stats.currentGoalName).toBe("Club Goal");
  });

  test("updateSessionTelemetry accumulates duration, streaks, and HR", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const service = await importService();

    await service.startSession("user-1");
    await service.updateSessionTelemetry("user-1", {
      heartRate: 130,
      inTargetZone: true,
      deltaSeconds: 30,
    });
    const updated = await service.updateSessionTelemetry("user-1", {
      heartRate: 135,
      inTargetZone: true,
      deltaSeconds: 15,
    });

    expect(updated.sessionDurationSeconds).toBe(45);
    expect(updated.timeInTargetZoneSeconds).toBe(45);
    expect(updated.longestStreakSeconds).toBe(45);
    expect(updated.currentHeartRate).toBe(135);
  });

  test("mixed target-zone states track total time and longest streak", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const service = await importService();

    await service.startSession("user-2");
    await service.updateSessionTelemetry("user-2", {
      inTargetZone: true,
      deltaSeconds: 20,
    });
    await service.updateSessionTelemetry("user-2", {
      inTargetZone: false,
      deltaSeconds: 10,
    });
    const stats = await service.updateSessionTelemetry("user-2", {
      inTargetZone: true,
      deltaSeconds: 40,
    });

    expect(stats.sessionDurationSeconds).toBe(70);
    expect(stats.timeInTargetZoneSeconds).toBe(60);
    expect(stats.longestStreakSeconds).toBe(40);
  });

  test("endSession returns history entry and clears active state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const service = await importService();

    await service.startSession("user-3", "BOUNCE_ENDURANCE", "Goal");
    await service.updateSessionTelemetry("user-3", {
      inTargetZone: true,
      deltaSeconds: 30,
    });
    await service.updateSessionTelemetry("user-3", {
      inTargetZone: false,
      deltaSeconds: 15,
    });

    const entry = await service.endSession("user-3");
    expect(entry).not.toBeNull();
    expect(entry?.durationSeconds).toBe(45);
    expect(entry?.timeInTargetZoneSeconds).toBe(30);
    expect(entry?.longestStreakSeconds).toBe(30);
    expect(entry?.trainingType).toBe("BOUNCE_ENDURANCE");
    expect(entry?.goalName).toBe("Goal");

    const stats = await service.getRunStats("user-3");
    expect(stats.sessionDurationSeconds).toBe(0);
    expect(stats.history).toHaveLength(1);
    expect(stats.history[0].id).toBe(entry?.id);
    expect(stats.history[0].timeInTargetZoneSeconds).toBe(30);
  });
});
