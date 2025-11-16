export type StampType =
  | "FIRST_SESSION"
  | "FIRST_10_MIN_IN_ZONE"
  | "FIRST_30_MIN_IN_ZONE"
  | "NIGHT_RUN"
  | "THREE_DAYS_IN_ROW"
  | "FIVE_DAYS_IN_ROW"
  | "FIRST_BOUNCE_SESSION"
  | "LONG_RUN_60_MIN"
  | "LONG_RUN_90_MIN";

export interface PassportStamp {
  id: string;
  userId: string;
  type: StampType;
  label: string;
  description: string;
  earnedAt: string;
  runId?: string;
}

export type MilestoneType =
  | "TOTAL_10_SESSIONS"
  | "TOTAL_50_SESSIONS"
  | "TOTAL_100_SESSIONS"
  | "TOTAL_10_HOURS"
  | "TOTAL_50_HOURS"
  | "TOTAL_100_HOURS";

export interface PassportMilestone {
  id: string;
  userId: string;
  type: MilestoneType;
  label: string;
  description: string;
  earnedAt: string;
}

export interface PassportSummary {
  userId: string;
  totalSessions: number;
  totalDurationSeconds: number;
  totalTimeInZoneSeconds: number;
  lastSessionAt?: string;
  stamps: PassportStamp[];
  milestones: PassportMilestone[];
}
