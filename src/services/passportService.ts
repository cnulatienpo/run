import path from "path";
import {
  MilestoneType,
  PassportMilestone,
  PassportStamp,
  PassportSummary,
  StampType,
} from "../models/passport";
import { RunHistoryEntry } from "../models/runStats";
import { ensureFile, readJson, writeJson } from "../utils/jsonStore";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STAMPS_FILE = path.join(DATA_DIR, "passportStamps.json");
const MILESTONES_FILE = path.join(DATA_DIR, "passportMilestones.json");

const stampsFileReady = ensureFile(STAMPS_FILE, {});
const milestonesFileReady = ensureFile(MILESTONES_FILE, {});

type StampStore = Record<string, PassportStamp[]>;
type MilestoneStore = Record<string, PassportMilestone[]>;

interface StampMeta {
  label: string;
  description: string;
}

const STAMP_METADATA: Record<StampType, StampMeta> = {
  FIRST_SESSION: {
    label: "First Session",
    description: "Logged your first RV training session.",
  },
  FIRST_10_MIN_IN_ZONE: {
    label: "10 Minutes In Zone",
    description: "Stayed in the target zone for at least 10 minutes in one session.",
  },
  FIRST_30_MIN_IN_ZONE: {
    label: "30 Minutes In Zone",
    description: "Stayed in the target zone for at least 30 minutes in one session.",
  },
  NIGHT_RUN: {
    label: "Night Run",
    description: "Completed a session between 8pm and 5am.",
  },
  THREE_DAYS_IN_ROW: {
    label: "3-Day Streak",
    description: "Trained three days in a row.",
  },
  FIVE_DAYS_IN_ROW: {
    label: "5-Day Streak",
    description: "Trained five days in a row.",
  },
  FIRST_BOUNCE_SESSION: {
    label: "Bounce Beginner",
    description: "Finished your first Bounce Endurance session.",
  },
  LONG_RUN_60_MIN: {
    label: "60-Minute Session",
    description: "Logged a session that lasted at least one hour.",
  },
  LONG_RUN_90_MIN: {
    label: "90-Minute Session",
    description: "Logged a session that lasted at least an hour and a half.",
  },
};

interface MilestoneMeta {
  threshold: number;
  label: string;
  description: string;
}

const SESSION_MILESTONES: Record<Extract<MilestoneType, `TOTAL_${string}_SESSIONS`>, MilestoneMeta> = {
  TOTAL_10_SESSIONS: {
    threshold: 10,
    label: "10 Sessions",
    description: "Logged ten total sessions.",
  },
  TOTAL_50_SESSIONS: {
    threshold: 50,
    label: "50 Sessions",
    description: "Logged fifty total sessions.",
  },
  TOTAL_100_SESSIONS: {
    threshold: 100,
    label: "100 Sessions",
    description: "Logged one hundred total sessions.",
  },
};

const DURATION_MILESTONES: Record<
  Extract<MilestoneType, `TOTAL_${string}_HOURS`>,
  MilestoneMeta
> = {
  TOTAL_10_HOURS: {
    threshold: 10 * 60 * 60,
    label: "10 Hours Logged",
    description: "Spent ten hours training in total.",
  },
  TOTAL_50_HOURS: {
    threshold: 50 * 60 * 60,
    label: "50 Hours Logged",
    description: "Spent fifty hours training in total.",
  },
  TOTAL_100_HOURS: {
    threshold: 100 * 60 * 60,
    label: "100 Hours Logged",
    description: "Spent one hundred hours training in total.",
  },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function cloneStamp(stamp: PassportStamp): PassportStamp {
  return { ...stamp };
}

function cloneMilestone(milestone: PassportMilestone): PassportMilestone {
  return { ...milestone };
}

async function loadStampStore(): Promise<StampStore> {
  await stampsFileReady;
  const data = await readJson<StampStore>(STAMPS_FILE);
  return data ?? {};
}

async function writeStampStore(store: StampStore): Promise<void> {
  await writeJson(STAMPS_FILE, store);
}

async function loadMilestoneStore(): Promise<MilestoneStore> {
  await milestonesFileReady;
  const data = await readJson<MilestoneStore>(MILESTONES_FILE);
  return data ?? {};
}

async function writeMilestoneStore(store: MilestoneStore): Promise<void> {
  await writeJson(MILESTONES_FILE, store);
}

async function saveStampsForUser(
  userId: string,
  stamps: PassportStamp[]
): Promise<void> {
  const store = await loadStampStore();
  store[userId] = stamps.map(cloneStamp);
  await writeStampStore(store);
}

async function saveMilestonesForUser(
  userId: string,
  milestones: PassportMilestone[]
): Promise<void> {
  const store = await loadMilestoneStore();
  store[userId] = milestones.map(cloneMilestone);
  await writeMilestoneStore(store);
}

function getDayTimestamp(dateIso: string): number {
  const date = new Date(dateIso);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function createStamp(
  userId: string,
  type: StampType,
  run: RunHistoryEntry
): PassportStamp {
  const meta = STAMP_METADATA[type];
  return {
    id: `${userId}:${type}:${run.id}`,
    userId,
    type,
    label: meta.label,
    description: meta.description,
    earnedAt: run.date,
    runId: run.id,
  };
}

function computeStamps(
  userId: string,
  history: RunHistoryEntry[]
): PassportStamp[] {
  const stamps: PassportStamp[] = [];
  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const awarded = new Set<StampType>();
  let streakCount = 0;
  let lastDay: number | null = null;

  for (const run of sorted) {
    if (!awarded.has("FIRST_SESSION")) {
      stamps.push(createStamp(userId, "FIRST_SESSION", run));
      awarded.add("FIRST_SESSION");
    }

    if (
      !awarded.has("FIRST_10_MIN_IN_ZONE") &&
      run.timeInTargetZoneSeconds >= 10 * 60
    ) {
      stamps.push(createStamp(userId, "FIRST_10_MIN_IN_ZONE", run));
      awarded.add("FIRST_10_MIN_IN_ZONE");
    }

    if (
      !awarded.has("FIRST_30_MIN_IN_ZONE") &&
      run.timeInTargetZoneSeconds >= 30 * 60
    ) {
      stamps.push(createStamp(userId, "FIRST_30_MIN_IN_ZONE", run));
      awarded.add("FIRST_30_MIN_IN_ZONE");
    }

    if (
      !awarded.has("FIRST_BOUNCE_SESSION") &&
      run.trainingType === "BOUNCE_ENDURANCE"
    ) {
      stamps.push(createStamp(userId, "FIRST_BOUNCE_SESSION", run));
      awarded.add("FIRST_BOUNCE_SESSION");
    }

    if (
      !awarded.has("LONG_RUN_60_MIN") &&
      run.durationSeconds >= 60 * 60
    ) {
      stamps.push(createStamp(userId, "LONG_RUN_60_MIN", run));
      awarded.add("LONG_RUN_60_MIN");
    }

    if (
      !awarded.has("LONG_RUN_90_MIN") &&
      run.durationSeconds >= 90 * 60
    ) {
      stamps.push(createStamp(userId, "LONG_RUN_90_MIN", run));
      awarded.add("LONG_RUN_90_MIN");
    }

    if (!awarded.has("NIGHT_RUN")) {
      const date = new Date(run.date);
      const hour = date.getUTCHours();
      if (hour >= 20 || hour < 5) {
        stamps.push(createStamp(userId, "NIGHT_RUN", run));
        awarded.add("NIGHT_RUN");
      }
    }

    const dayTs = getDayTimestamp(run.date);
    if (lastDay === null) {
      streakCount = 1;
      lastDay = dayTs;
    } else if (dayTs === lastDay) {
      // same day, keep streak unchanged
    } else {
      const deltaDays = Math.round((dayTs - lastDay) / MS_PER_DAY);
      if (deltaDays === 1) {
        streakCount += 1;
      } else {
        streakCount = 1;
      }
      lastDay = dayTs;
    }

    if (streakCount >= 3 && !awarded.has("THREE_DAYS_IN_ROW")) {
      stamps.push(createStamp(userId, "THREE_DAYS_IN_ROW", run));
      awarded.add("THREE_DAYS_IN_ROW");
    }

    if (streakCount >= 5 && !awarded.has("FIVE_DAYS_IN_ROW")) {
      stamps.push(createStamp(userId, "FIVE_DAYS_IN_ROW", run));
      awarded.add("FIVE_DAYS_IN_ROW");
    }
  }

  return stamps;
}

function createMilestone(
  userId: string,
  type: MilestoneType,
  earnedAt: string
): PassportMilestone {
  const meta =
    SESSION_MILESTONES[type as keyof typeof SESSION_MILESTONES] ||
    DURATION_MILESTONES[type as keyof typeof DURATION_MILESTONES];
  return {
    id: `${userId}:${type}`,
    userId,
    type,
    label: meta.label,
    description: meta.description,
    earnedAt,
  };
}

function computeMilestones(
  userId: string,
  history: RunHistoryEntry[]
): PassportMilestone[] {
  const milestones: PassportMilestone[] = [];
  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let totalSessions = 0;
  let totalDurationSeconds = 0;
  const awarded = new Set<MilestoneType>();

  for (const run of sorted) {
    totalSessions += 1;
    totalDurationSeconds += run.durationSeconds;

    (Object.entries(SESSION_MILESTONES) as [MilestoneType, MilestoneMeta][]).forEach(
      ([type, meta]) => {
        if (!awarded.has(type) && totalSessions >= meta.threshold) {
          milestones.push(createMilestone(userId, type, run.date));
          awarded.add(type);
        }
      }
    );

    (Object.entries(DURATION_MILESTONES) as [MilestoneType, MilestoneMeta][]).forEach(
      ([type, meta]) => {
        if (!awarded.has(type) && totalDurationSeconds >= meta.threshold) {
          milestones.push(createMilestone(userId, type, run.date));
          awarded.add(type);
        }
      }
    );
  }

  return milestones;
}

export async function recomputePassportForUser(
  userId: string,
  history: RunHistoryEntry[]
): Promise<PassportSummary> {
  let totalDurationSeconds = 0;
  let totalTimeInZoneSeconds = 0;
  let lastSessionAt: string | undefined;
  let lastTimestamp = -Infinity;

  for (const run of history) {
    totalDurationSeconds += run.durationSeconds;
    totalTimeInZoneSeconds += run.timeInTargetZoneSeconds;
    const timestamp = new Date(run.date).getTime();
    if (Number.isFinite(timestamp) && timestamp > lastTimestamp) {
      lastTimestamp = timestamp;
      lastSessionAt = run.date;
    }
  }

  const stamps = computeStamps(userId, history);
  const milestones = computeMilestones(userId, history);

  await Promise.all([
    saveStampsForUser(userId, stamps),
    saveMilestonesForUser(userId, milestones),
  ]);

  return {
    userId,
    totalSessions: history.length,
    totalDurationSeconds,
    totalTimeInZoneSeconds,
    ...(lastSessionAt ? { lastSessionAt } : {}),
    stamps,
    milestones,
  };
}

export async function getStoredStamps(
  userId: string
): Promise<PassportStamp[]> {
  const store = await loadStampStore();
  return (store[userId] ?? []).map(cloneStamp);
}

export async function getStoredMilestones(
  userId: string
): Promise<PassportMilestone[]> {
  const store = await loadMilestoneStore();
  return (store[userId] ?? []).map(cloneMilestone);
}
