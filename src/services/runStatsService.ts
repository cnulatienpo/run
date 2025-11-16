import { randomUUID } from "crypto";
import { RunHistoryEntry, RunStats } from "../models/runStats";

interface InternalSessionState {
  userId: string;
  startedAt: number;
  currentHeartRate: number | null;
  timeInTargetZoneSeconds: number;
  longestStreakSeconds: number;
  currentStreakSeconds: number;
  sessionDurationSeconds: number;
  lastUpdateAt: number;
  trainingType?: string;
  goalName?: string;
}

const currentSessions: Map<string, InternalSessionState> = new Map();
const historyStore: Map<string, RunHistoryEntry[]> = new Map();

function getHistoryBucket(userId: string): RunHistoryEntry[] {
  if (!historyStore.has(userId)) {
    historyStore.set(userId, []);
  }
  return historyStore.get(userId)!;
}

export function startSession(
  userId: string,
  trainingType?: string,
  goalName?: string
): void {
  if (currentSessions.has(userId)) {
    endSession(userId);
  }
  const now = Date.now();
  currentSessions.set(userId, {
    userId,
    startedAt: now,
    currentHeartRate: null,
    timeInTargetZoneSeconds: 0,
    longestStreakSeconds: 0,
    currentStreakSeconds: 0,
    sessionDurationSeconds: 0,
    lastUpdateAt: now,
    trainingType,
    goalName,
  });
}

function ensureSession(userId: string): InternalSessionState {
  const session = currentSessions.get(userId);
  if (!session) {
    throw new Error("No active run session for user");
  }
  return session;
}

export function updateSessionTelemetry(
  userId: string,
  payload: { heartRate?: number; inTargetZone?: boolean; deltaSeconds?: number }
): RunStats {
  const session = ensureSession(userId);
  const now = Date.now();
  let deltaSeconds =
    typeof payload.deltaSeconds === "number" ? payload.deltaSeconds : undefined;

  if (deltaSeconds === undefined) {
    deltaSeconds = Math.max(0, (now - session.lastUpdateAt) / 1000);
  }
  if (deltaSeconds < 0) {
    deltaSeconds = 0;
  }

  session.sessionDurationSeconds += deltaSeconds;
  session.lastUpdateAt = now;

  if (typeof payload.heartRate === "number") {
    session.currentHeartRate = payload.heartRate;
  }

  if (payload.inTargetZone === true) {
    session.timeInTargetZoneSeconds += deltaSeconds;
    session.currentStreakSeconds += deltaSeconds;
    session.longestStreakSeconds = Math.max(
      session.longestStreakSeconds,
      session.currentStreakSeconds
    );
  } else if (payload.inTargetZone === false) {
    session.currentStreakSeconds = 0;
  }

  return getRunStats(userId);
}

export function endSession(userId: string): RunHistoryEntry | null {
  const session = currentSessions.get(userId);
  if (!session) {
    return null;
  }

  const now = Date.now();
  session.sessionDurationSeconds += Math.max(0, (now - session.lastUpdateAt) / 1000);
  session.lastUpdateAt = now;

  const entry: RunHistoryEntry = {
    id: randomUUID(),
    date: new Date(session.startedAt).toISOString(),
    durationSeconds: Math.round(session.sessionDurationSeconds),
    timeInTargetZoneSeconds: Math.round(session.timeInTargetZoneSeconds),
    longestStreakSeconds: Math.round(session.longestStreakSeconds),
    trainingType: session.trainingType,
    goalName: session.goalName,
  };

  const history = getHistoryBucket(userId);
  history.unshift(entry);

  currentSessions.delete(userId);
  return entry;
}

export function getRunStats(userId: string): RunStats {
  const session = currentSessions.get(userId);
  const history = [...getHistoryBucket(userId)];

  if (!session) {
    return {
      currentHeartRate: null,
      timeInTargetZoneSeconds: 0,
      longestStreakSeconds: 0,
      sessionDurationSeconds: 0,
      history,
    };
  }

  const now = Date.now();
  const elapsedSinceLastUpdate = Math.max(0, (now - session.lastUpdateAt) / 1000);

  const sessionDurationSeconds =
    session.sessionDurationSeconds + elapsedSinceLastUpdate;

  const bounceEnduranceMinutes =
    session.trainingType === "BOUNCE_ENDURANCE"
      ? Math.round(session.timeInTargetZoneSeconds / 60)
      : undefined;

  return {
    currentHeartRate: session.currentHeartRate,
    timeInTargetZoneSeconds: Math.round(session.timeInTargetZoneSeconds),
    longestStreakSeconds: Math.round(session.longestStreakSeconds),
    sessionDurationSeconds: Math.round(sessionDurationSeconds),
    currentGoalName: session.goalName,
    bounceEnduranceMinutes,
    history,
  };
}

export function getHistory(userId: string): RunHistoryEntry[] {
  return [...getHistoryBucket(userId)];
}
