import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_EXPERIENCE_SETTINGS,
  ExperienceProfile,
  ExperienceSettings,
} from "../types/experience";
import { useExperienceSettings } from "../../hooks/useExperienceSettings";
import { setApiUserId } from "../../api";

interface ExperienceContextValue {
  settings: ExperienceSettings;
  setSettings: React.Dispatch<React.SetStateAction<ExperienceSettings>>;
  updateSetting: <K extends keyof ExperienceSettings>(
    key: K,
    value: ExperienceSettings[K]
  ) => void;
  isExperiencePageOpen: boolean;
  openExperiencePage: () => void;
  closeExperiencePage: () => void;
  profiles: ExperienceProfile[];
  activeProfileId: string | null;
  saveProfile: (name?: string) => void;
  saveProfileAsNew: (name?: string) => void;
  loadProfile: (id: string) => void;
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: Error | null;
  refreshSettings: () => void;
  saveSettings: (next?: ExperienceSettings) => Promise<void>;
}

const ExperienceContext = createContext<ExperienceContextValue | undefined>(
  undefined
);

const cloneSettings = (settings: ExperienceSettings): ExperienceSettings => ({
  ...settings,
  allowedSources: [...settings.allowedSources],
  timeOfDay: [...settings.timeOfDay],
  atmosphere: [...settings.atmosphere],
  noGoFilters: { ...settings.noGoFilters },
  heartRateBand: settings.heartRateBand
    ? { ...settings.heartRateBand }
    : undefined,
});

const initialProfiles: ExperienceProfile[] = [
  {
    id: "profile-baseline",
    name: DEFAULT_EXPERIENCE_SETTINGS.profileName ?? "Baseline Flow",
    settings: cloneSettings(DEFAULT_EXPERIENCE_SETTINGS),
  },
  {
    id: "profile-night-escape",
    name: "Night Escape Mix",
    settings: {
      ...cloneSettings(DEFAULT_EXPERIENCE_SETTINGS),
      focusMode: "MIX",
      cameraMovement: "ALWAYS_MOVING",
      locationEnvironment: "OUTDOOR",
      timeOfDay: ["SUNSET", "NIGHT"],
      atmosphere: ["NEON", "LOW_LIGHT"],
      trainingType: "MIXED_MODE",
      profileName: "Night Escape Mix",
    },
  },
];

export const ExperienceProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [profiles, setProfiles] = useState<ExperienceProfile[]>(initialProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    initialProfiles[0]?.id ?? null
  );
  const {
    settings,
    setLocalSettings,
    loading: settingsLoading,
    saving: settingsSaving,
    error: settingsError,
    refresh,
    save,
  } = useExperienceSettings();
  const [isExperiencePageOpen, setExperiencePageOpen] = useState(false);

  useEffect(() => {
    setApiUserId(activeProfileId ?? undefined);
  }, [activeProfileId]);

  const resolvedSettings = settings ?? cloneSettings(
    initialProfiles[0]?.settings ?? DEFAULT_EXPERIENCE_SETTINGS
  );

  const setSettings = useCallback<
    React.Dispatch<React.SetStateAction<ExperienceSettings>>
  >(
    (updater) => {
      setLocalSettings((prev) => {
        const base = prev ?? resolvedSettings;
        const next =
          typeof updater === "function"
            ? (updater as (value: ExperienceSettings) => ExperienceSettings)(base)
            : updater;
        return { ...next };
      });
    },
    [resolvedSettings, setLocalSettings]
  );

  const persistSettings = useCallback(
    async (next?: ExperienceSettings) => {
      const payload = next ?? resolvedSettings;
      await save(payload);
    },
    [resolvedSettings, save]
  );

  const updateSetting = useCallback(
    <K extends keyof ExperienceSettings>(
      key: K,
      value: ExperienceSettings[K]
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [setSettings]
  );

  const saveProfile = useCallback(
    (name?: string) => {
      if (!activeProfileId) {
        return;
      }
      const resolvedName = name ?? resolvedSettings.profileName ?? "Custom profile";
      const nextSettings = { ...resolvedSettings, profileName: resolvedName };
      setProfiles((prev) =>
        prev.map((profile) =>
          profile.id === activeProfileId
            ? {
                ...profile,
                name: resolvedName,
                settings: cloneSettings(nextSettings),
              }
            : profile
        )
      );
      setSettings(nextSettings);
      void persistSettings(nextSettings).catch((error) => {
        console.error("[ExperienceProvider] Failed to persist profile", error);
      });
    },
    [activeProfileId, persistSettings, resolvedSettings, setSettings]
  );

  const saveProfileAsNew = useCallback(
    (name?: string) => {
      const resolvedName = name ?? resolvedSettings.profileName ?? "New profile";
      const id = `profile-${Date.now()}`;
      const profile: ExperienceProfile = {
        id,
        name: resolvedName,
        settings: cloneSettings(resolvedSettings),
      };
      setProfiles((prev) => [...prev, profile]);
      setActiveProfileId(id);
      const nextSettings = { ...resolvedSettings, profileName: resolvedName };
      setSettings(nextSettings);
      void persistSettings(nextSettings).catch((error) => {
        console.error("[ExperienceProvider] Failed to persist new profile", error);
      });
    },
    [persistSettings, resolvedSettings, setSettings]
  );

  const loadProfile = useCallback(
    (id: string) => {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) {
        return;
      }
      setActiveProfileId(id);
      setSettings(cloneSettings(profile.settings));
    },
    [profiles, setSettings]
  );

  const openExperiencePage = useCallback(() => setExperiencePageOpen(true), []);
  const closeExperiencePage = useCallback(() => setExperiencePageOpen(false), []);

  const contextValue = useMemo<ExperienceContextValue>(
    () => ({
      settings: resolvedSettings,
      setSettings,
      updateSetting,
      isExperiencePageOpen,
      openExperiencePage,
      closeExperiencePage,
      profiles,
      activeProfileId,
      saveProfile,
      saveProfileAsNew,
      loadProfile,
      settingsLoading,
      settingsSaving,
      settingsError,
      refreshSettings: refresh,
      saveSettings: persistSettings,
    }),
    [
      resolvedSettings,
      isExperiencePageOpen,
      profiles,
      activeProfileId,
      saveProfile,
      saveProfileAsNew,
      loadProfile,
      updateSetting,
      settingsLoading,
      settingsSaving,
      settingsError,
      refresh,
      persistSettings,
    ]
  );

  return (
    <ExperienceContext.Provider value={contextValue}>
      {children}
    </ExperienceContext.Provider>
  );
};

export const useExperience = (): ExperienceContextValue => {
  const context = useContext(ExperienceContext);
  if (!context) {
    throw new Error("useExperience must be used within ExperienceProvider");
  }
  return context;
};
