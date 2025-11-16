import { useCallback, useEffect, useState } from "react";
import { endRunSession, startRunSession, StartSessionPayload } from "../api/runClient";
import { useTelemetry } from "../telemetry/TelemetryContext";

export interface UseRunSessionResult {
  isRunning: boolean;
  start: (opts?: StartSessionPayload) => Promise<void>;
  stop: () => Promise<void>;
}

export function useRunSession(): UseRunSessionResult {
  const { start: startTelemetry, stop: stopTelemetry, isRunning: telemetryRunning } =
    useTelemetry();
  const [isRunning, setIsRunning] = useState<boolean>(telemetryRunning);

  useEffect(() => {
    setIsRunning(telemetryRunning);
  }, [telemetryRunning]);

  const start = useCallback(
    async (opts?: StartSessionPayload) => {
      if (isRunning) {
        return;
      }
      await startRunSession(opts ?? {});
      try {
        await startTelemetry(opts);
        setIsRunning(true);
      } catch (error) {
        await endRunSession().catch((endError) => {
          console.error("[useRunSession] Failed to clean up run session", endError);
        });
        throw error;
      }
    },
    [isRunning, startTelemetry]
  );

  const stop = useCallback(async () => {
    if (!isRunning) {
      return;
    }
    try {
      await stopTelemetry();
    } catch (error) {
      console.error("[useRunSession] Failed to stop telemetry", error);
    }
    try {
      await endRunSession();
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, stopTelemetry]);

  useEffect(() => {
    return () => {
      if (isRunning) {
        void stop();
      }
    };
  }, [isRunning, stop]);

  return { isRunning, start, stop };
}
