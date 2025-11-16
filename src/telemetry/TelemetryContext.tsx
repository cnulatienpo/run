import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { endRunSession, startRunSession, StartSessionPayload } from "../api/runClient";
import { TelemetryManager, TelemetryState, HeartRateBand } from "./TelemetryManager";
import { FakeStepAdapter } from "./deviceAdapters/FakeStepAdapter";

interface TelemetryContextValue {
  state: TelemetryState;
  isRunning: boolean;
  start: (payload?: StartSessionPayload) => Promise<void>;
  stop: () => Promise<void>;
}

const TelemetryContext = createContext<TelemetryContextValue | undefined>(
  undefined
);

const DEFAULT_BASE_URL =
  ((globalThis as any)?.process?.env?.RUN_API_BASE_URL as string | undefined) ??
  "http://localhost:3001";

interface TelemetryProviderProps {
  baseUrl?: string;
  heartRateBand?: HeartRateBand;
  userId?: string;
}

export const TelemetryProvider: React.FC<
  React.PropsWithChildren<TelemetryProviderProps>
> = ({ children, baseUrl = DEFAULT_BASE_URL, heartRateBand, userId }) => {
  const adapterRef = useRef(new FakeStepAdapter());
  const managerRef = useRef(
    new TelemetryManager(adapterRef.current, {
      baseUrl,
      heartRateBand,
      userId,
    })
  );

  useEffect(() => {
    managerRef.current.setHeartRateBand(heartRateBand);
  }, [heartRateBand]);

  const [state, setState] = useState<TelemetryState>(managerRef.current.getState());
  useEffect(() => {
    const unsubscribe = managerRef.current.subscribe((next) => setState(next));
    return unsubscribe;
  }, []);

  const [isRunning, setIsRunning] = useState(managerRef.current.isRunning());
  const runningRef = useRef(managerRef.current.isRunning());

  const start = useCallback(
    async (payload?: StartSessionPayload) => {
      if (runningRef.current) {
        return;
      }
      runningRef.current = true;
      let sessionCreated = false;
      try {
        await startRunSession(baseUrl, payload ?? {}, userId);
        sessionCreated = true;
        await managerRef.current.start();
        setIsRunning(true);
      } catch (error) {
        runningRef.current = false;
        setIsRunning(false);
        if (sessionCreated) {
          try {
            await endRunSession(baseUrl, userId);
          } catch (endError) {
            console.error("[TelemetryProvider] Failed to clean up run session", endError);
          }
        }
        console.error("[TelemetryProvider] Failed to start session", error);
        throw error;
      }
    },
    [baseUrl, userId]
  );

  const stop = useCallback(async () => {
    if (!runningRef.current) {
      return;
    }
    runningRef.current = false;
    setIsRunning(false);
    try {
      await managerRef.current.stop();
    } catch (error) {
      console.error("[TelemetryProvider] Failed to stop adapter", error);
    }
    try {
      await endRunSession(baseUrl, userId);
    } catch (error) {
      console.error("[TelemetryProvider] Failed to end run session", error);
      throw error;
    }
  }, [baseUrl, userId]);

  useEffect(() => {
    return () => {
      if (runningRef.current) {
        void stop();
      }
    };
  }, [stop]);

  const value = useMemo<TelemetryContextValue>(
    () => ({ state, isRunning, start, stop }),
    [state, isRunning, start, stop]
  );

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
};

export const useTelemetry = (): TelemetryContextValue => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("useTelemetry must be used within TelemetryProvider");
  }
  return context;
};
