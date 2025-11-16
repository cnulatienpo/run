export interface RunHistoryEntry {
  id: string;
  date: string; // ISO timestamp
  durationSeconds: number;
  timeInTargetZoneSeconds: number;
  longestStreakSeconds: number;
  trainingType?: string;
  goalName?: string;
}

export interface RunStats {
  currentHeartRate: number | null;
  timeInTargetZoneSeconds: number;
  longestStreakSeconds: number;
  sessionDurationSeconds: number;
  currentGoalName?: string;
  bounceEnduranceMinutes?: number;
  history: RunHistoryEntry[];
}
