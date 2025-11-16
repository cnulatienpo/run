import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ExperienceSettings } from "../rv/types/experience";
import {
  fetchExperienceSettings,
  saveExperienceSettings,
} from "../api/experienceClient";

export interface UseExperienceSettingsResult {
  settings: ExperienceSettings | null;
  setLocalSettings: Dispatch<SetStateAction<ExperienceSettings | null>>;
  loading: boolean;
  saving: boolean;
  error: Error | null;
  refresh: () => void;
  save: (next: ExperienceSettings) => Promise<void>;
}

export function useExperienceSettings(): UseExperienceSettingsResult {
  const [settings, setSettings] = useState<ExperienceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchExperienceSettings();
      if (!isMountedRef.current) {
        return;
      }
      setSettings(next);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      setError(err as Error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (next: ExperienceSettings) => {
      setSaving(true);
      setError(null);
      try {
        const saved = await saveExperienceSettings(next);
        if (!isMountedRef.current) {
          return;
        }
        setSettings(saved);
      } catch (err) {
        if (isMountedRef.current) {
          setError(err as Error);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setSaving(false);
        }
      }
    },
    []
  );

  return { settings, setLocalSettings: setSettings, loading, saving, error, refresh, save };
}
