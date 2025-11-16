import { beforeEach, describe, expect, test } from "vitest";
import { RunHistoryEntry } from "../models/runStats";
import { recomputePassportForUser } from "../services/passportService";

let counter = 0;
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TS = Date.UTC(2024, 0, 1, 10, 0, 0);

function makeRun(dayOffset: number, overrides: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  counter += 1;
  const date = new Date(BASE_TS + dayOffset * DAY_MS).toISOString();
  return {
    id: `run-${counter}`,
    date,
    durationSeconds: 900,
    timeInTargetZoneSeconds: 300,
    longestStreakSeconds: 120,
    ...overrides,
  };
}

describe("passportService", () => {
  beforeEach(() => {
    counter = 0;
  });
  test("computes streak and session stamps", () => {
    const history: RunHistoryEntry[] = [
      makeRun(0, { durationSeconds: 300, timeInTargetZoneSeconds: 100 }),
      makeRun(1, { timeInTargetZoneSeconds: 650 }),
      makeRun(2, { timeInTargetZoneSeconds: 2000 }),
      makeRun(3, { durationSeconds: 3700, timeInTargetZoneSeconds: 1200 }),
      makeRun(4, { trainingType: "BOUNCE_ENDURANCE", timeInTargetZoneSeconds: 400 }),
    ];

    const summary = recomputePassportForUser("user-1", history);
    const stampTypes = summary.stamps.map((stamp) => stamp.type);

    expect(summary.totalSessions).toBe(history.length);
    expect(summary.totalDurationSeconds).toBe(
      history.reduce((sum, run) => sum + run.durationSeconds, 0)
    );
    expect(summary.totalTimeInZoneSeconds).toBe(
      history.reduce((sum, run) => sum + run.timeInTargetZoneSeconds, 0)
    );
    expect(summary.lastSessionAt).toBe(history[history.length - 1].date);

    expect(stampTypes).toEqual(
      expect.arrayContaining([
        "FIRST_SESSION",
        "FIRST_10_MIN_IN_ZONE",
        "FIRST_30_MIN_IN_ZONE",
        "LONG_RUN_60_MIN",
        "FIRST_BOUNCE_SESSION",
        "THREE_DAYS_IN_ROW",
        "FIVE_DAYS_IN_ROW",
      ])
    );
  });

  test("awards cumulative session and duration milestones", () => {
    const history: RunHistoryEntry[] = Array.from({ length: 100 }, (_, idx) =>
      makeRun(idx, {
        durationSeconds: 3600,
        timeInTargetZoneSeconds: 1800,
        longestStreakSeconds: 900,
      })
    );

    const summary = recomputePassportForUser("user-2", history);
    const milestoneTypes = summary.milestones.map((milestone) => milestone.type);

    expect(summary.totalSessions).toBe(100);
    expect(summary.totalDurationSeconds).toBe(3600 * 100);
    expect(summary.totalTimeInZoneSeconds).toBe(1800 * 100);
    expect(summary.lastSessionAt).toBe(history[history.length - 1].date);

    expect(milestoneTypes).toEqual(
      expect.arrayContaining([
        "TOTAL_10_SESSIONS",
        "TOTAL_50_SESSIONS",
        "TOTAL_100_SESSIONS",
        "TOTAL_10_HOURS",
        "TOTAL_50_HOURS",
        "TOTAL_100_HOURS",
      ])
    );
  });
});
