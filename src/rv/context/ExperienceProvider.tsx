import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_EXPERIENCE_SETTINGS,
  ExperienceProfile,
  ExperienceSettings,
  RunStats,
  MOCK_RUN_STATS,
} from "../types/experience";

interface ExperienceContextValue {
  settings: ExperienceSettings;
  setSettings: React.Dispatch<React.SetStateAction<ExperienceSettings>>;
  updateSetting: <K extends keyof ExperienceSettings>(
    key: K,
    value: ExperienceSettings[K]
  ) => void;
  runStats: RunStats;
  isExperiencePageOpen: boolean;
  openExperiencePage: () => void;
  closeExperiencePage: () => void;
  profiles: ExperienceProfile[];
  activeProfileId: string | null;
  saveProfile: (name?: string) => void;
  saveProfileAsNew: (name?: string) => void;
  loadProfile: (id: string) => void;
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
  const [settings, setSettings] = useState<ExperienceSettings>(
    cloneSettings(initialProfiles[0]?.settings ?? DEFAULT_EXPERIENCE_SETTINGS)
  );
  const [runStats] = useState<RunStats>(MOCK_RUN_STATS);
  const [isExperiencePageOpen, setExperiencePageOpen] = useState(false);

  const updateSetting = useCallback(
    <K extends keyof ExperienceSettings>(
      key: K,
      value: ExperienceSettings[K]
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const saveProfile = useCallback(
    (name?: string) => {
      if (!activeProfileId) {
        return;
      }
      const resolvedName = name ?? settings.profileName ?? "Custom profile";
      setProfiles((prev) =>
        prev.map((profile) =>
          profile.id === activeProfileId
            ? {
                ...profile,
                name: resolvedName,
                settings: cloneSettings(settings),
              }
            : profile
        )
      );
      setSettings((prev) => ({ ...prev, profileName: resolvedName }));
    },
    [activeProfileId, settings]
  );

  const saveProfileAsNew = useCallback(
    (name?: string) => {
      const resolvedName = name ?? settings.profileName ?? "New profile";
      const id = `profile-${Date.now()}`;
      const profile: ExperienceProfile = {
        id,
        name: resolvedName,
        settings: cloneSettings(settings),
      };
      setProfiles((prev) => [...prev, profile]);
      setActiveProfileId(id);
      setSettings((prev) => ({ ...prev, profileName: resolvedName }));
    },
    [settings]
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
    [profiles]
  );

  const openExperiencePage = useCallback(() => setExperiencePageOpen(true), []);
  const closeExperiencePage = useCallback(() => setExperiencePageOpen(false), []);

  const contextValue = useMemo<ExperienceContextValue>(
    () => ({
      settings,
      setSettings,
      updateSetting,
      runStats,
      isExperiencePageOpen,
      openExperiencePage,
      closeExperiencePage,
      profiles,
      activeProfileId,
      saveProfile,
      saveProfileAsNew,
      loadProfile,
    }),
    [
      settings,
      runStats,
      isExperiencePageOpen,
      profiles,
      activeProfileId,
      saveProfile,
      saveProfileAsNew,
      loadProfile,
      updateSetting,
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
