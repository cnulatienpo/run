import path from "path";
import { randomUUID } from "crypto";
import { RunHistoryEntry, RunStats } from "../models/runStats";
import { ensureFile, readJson, writeJson } from "../utils/jsonStore";
import {
  RunTelemetryPayload,
  validateRunHistoryEntry,
  validateRunStats,
} from "../validation/schemas";

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

const DATA_DIR = path.resolve(process.cwd(), "data");
const RUN_HISTORY_FILE = path.join(DATA_DIR, "runHistory.json");
const SESSION_STATE_FILE = path.join(DATA_DIR, "sessionState.json");

const runHistoryFileReady = ensureFile(RUN_HISTORY_FILE, {});
const sessionStateFileReady = ensureFile(SESSION_STATE_FILE, {});

type RunHistoryStore = Record<string, RunHistoryEntry[]>;

async function loadHistory(): Promise<RunHistoryStore> {
  await runHistoryFileReady;
  const data = await readJson<RunHistoryStore>(RUN_HISTORY_FILE);
  return data ?? {};
}

async function writeHistory(store: RunHistoryStore): Promise<void> {
  await writeJson(RUN_HISTORY_FILE, store);
}

function cloneHistory(entries: RunHistoryEntry[]): RunHistoryEntry[] {
  return entries
    .map((entry) => {
      const cloned: RunHistoryEntry = {
        id: entry.id,
        date: entry.date,
        durationSeconds: entry.durationSeconds,
        timeInTargetZoneSeconds: entry.timeInTargetZoneSeconds,
        longestStreakSeconds: entry.longestStreakSeconds,
      };
      if (entry.trainingType !== undefined) {
        cloned.trainingType = entry.trainingType;
      }
      if (entry.goalName !== undefined) {
        cloned.goalName = entry.goalName;
      }
      return cloned;
    })
    .filter((entry) => validateRunHistoryEntry(entry));
}

async function ensureSessionStateFile(): Promise<void> {
  await sessionStateFileReady;
}

export async function startSession(
  userId: string,
  trainingType?: string,
  goalName?: string
): Promise<void> {
  await ensureSessionStateFile();
  if (currentSessions.has(userId)) {
    await endSession(userId);
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

export async function updateSessionTelemetry(
  userId: string,
  payload: RunTelemetryPayload
): Promise<RunStats> {
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

export async function endSession(
  userId: string
): Promise<RunHistoryEntry | null> {
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
    ...(session.trainingType !== undefined
      ? { trainingType: session.trainingType }
      : {}),
    ...(session.goalName !== undefined ? { goalName: session.goalName } : {}),
  };

  const store = await loadHistory();
  const history = store[userId] ?? [];
  store[userId] = [entry, ...history];
  await writeHistory(store);

  currentSessions.delete(userId);
  return entry;
}

export async function getRunStats(userId: string): Promise<RunStats> {
  const session = currentSessions.get(userId);
  const store = await loadHistory();
  const history = cloneHistory(store[userId] ?? []);

  if (!session) {
    const stats: RunStats = {
      currentHeartRate: null,
      timeInTargetZoneSeconds: 0,
      longestStreakSeconds: 0,
      sessionDurationSeconds: 0,
      history,
    };
    if (!validateRunStats(stats)) {
      throw new Error("Invalid run stats payload");
    }
    return stats;
  }

  const now = Date.now();
  const elapsedSinceLastUpdate = Math.max(0, (now - session.lastUpdateAt) / 1000);

  const sessionDurationSeconds =
    session.sessionDurationSeconds + elapsedSinceLastUpdate;

  const bounceEnduranceMinutes =
    session.trainingType === "BOUNCE_ENDURANCE"
      ? Math.round(session.timeInTargetZoneSeconds / 60)
      : undefined;

  const stats: RunStats = {
    currentHeartRate: session.currentHeartRate,
    timeInTargetZoneSeconds: Math.round(session.timeInTargetZoneSeconds),
    longestStreakSeconds: Math.round(session.longestStreakSeconds),
    sessionDurationSeconds: Math.round(sessionDurationSeconds),
    history,
    ...(session.goalName !== undefined
      ? { currentGoalName: session.goalName }
      : {}),
    ...(bounceEnduranceMinutes !== undefined
      ? { bounceEnduranceMinutes }
      : {}),
  };
  if (!validateRunStats(stats)) {
    throw new Error("Invalid run stats payload");
  }
  return stats;
}

export async function getHistory(userId: string): Promise<RunHistoryEntry[]> {
  const store = await loadHistory();
  return cloneHistory(store[userId] ?? []);
}
