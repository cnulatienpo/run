import { useCallback, useEffect, useRef, useState } from "react";
import { RunStats } from "../rv/types/experience";
import { fetchRunStats } from "../api/runClient";

export interface UseRunStatsOptions {
  pollIntervalMs?: number;
  enabled?: boolean;
}

export interface UseRunStatsResult {
  stats: RunStats | null;
  loading: boolean;
  error: Error | null;
}

export function useRunStats(options: UseRunStatsOptions = {}): UseRunStatsResult {
  const { pollIntervalMs = 5000, enabled = true } = options;
  const [stats, setStats] = useState<RunStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadStats = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await fetchRunStats();
      if (!isMountedRef.current) {
        return;
      }
      setStats(next);
      setError(null);
      hasLoadedRef.current = true;
      setLoading(false);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      setError(err as Error);
      if (!hasLoadedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      await loadStats();
    };

    void run();

    if (enabled) {
      timer = setInterval(() => {
        void run();
      }, pollIntervalMs);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [enabled, pollIntervalMs, loadStats]);

  return { stats, loading, error };
}
