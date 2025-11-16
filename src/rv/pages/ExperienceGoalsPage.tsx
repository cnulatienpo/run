import React from "react";
import {
  Atmosphere,
  CameraMovementPreference,
  ExperienceFocusMode,
  ExperienceSettings,
  NoGoFilters,
  SourceFootageType,
  TimeOfDay,
} from "../types/experience";
import { useExperience } from "../context/ExperienceProvider";

const pageStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(3, 6, 15, 0.96)",
  color: "#f8fafc",
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  padding: "32px clamp(24px, 5vw, 64px)",
  overflowY: "auto",
  zIndex: 1500,
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 32,
  alignItems: "flex-start",
  maxWidth: 1400,
  margin: "0 auto",
};

const configColumnStyle: React.CSSProperties = {
  flex: "2 1 640px",
  display: "flex",
  flexDirection: "column",
  gap: 24,
};

const statsColumnStyle: React.CSSProperties = {
  flex: "1 1 320px",
  background: "rgba(255,255,255,0.06)",
  borderRadius: 20,
  padding: 24,
  minWidth: 280,
};

const sectionStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  borderRadius: 16,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const optionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.2)",
};

const Section: React.FC<{ title: string; description?: string }> = ({
  title,
  description,
  children,
}) => (
  <section style={sectionStyle} aria-labelledby={`${title}-label`}>
    <div>
      <h2
        id={`${title}-label`}
        style={{
          fontSize: 18,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {description && (
        <p style={{ margin: "4px 0 0", color: "#cbd5f5", fontSize: 14 }}>
          {description}
        </p>
      )}
    </div>
    {children}
  </section>
);

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const toggleValue = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

const noGoEntries: Array<{ key: keyof NoGoFilters; label: string }> = [
  { key: "staticCameras", label: "Static cameras" },
  { key: "cameraBob", label: "Camera bob" },
  { key: "runningOnlyPOV", label: "Running-only POV" },
  { key: "talkingHeads", label: "Talking heads" },
  { key: "drivingPOV", label: "Driving POV" },
  { key: "droneFootage", label: "Drone footage" },
  { key: "selfieFootage", label: "Selfie footage" },
  { key: "fastSpins", label: "Fast spins / vertigo" },
  { key: "peopleSittingStill", label: "People sitting still" },
  { key: "gyms", label: "Gyms" },
];

const cameraMovementLabels: Record<CameraMovementPreference, string> = {
  STILL_OK: "Still ok",
  MIXED: "Mixed",
  ALWAYS_MOVING: "Always moving",
};

const focusModeLabels: Record<ExperienceFocusMode, string> = {
  GOAL: "Sustain a goal",
  ESCAPE: "Just escape",
  MIX: "Mix both",
};

const allowedSourceLabels: Record<SourceFootageType, string> = {
  LIVE: "Live footage",
  VHS_RETRO: "VHS / retro",
  FILM_CLIP: "Film clips",
  ANIMATED: "Animated",
  GAME: "Game environments",
  AI: "AI-generated",
  MUSIC_VIDEO: "Music videos",
  CONCERT_WALKTHROUGH: "Concert walk-throughs",
  CLUB_WALKIN: "Club walk-ins",
};

const timeOfDayLabels: Record<TimeOfDay, string> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  SUNSET: "Sunset",
  NIGHT: "Night",
  INDOORS_NO_TIME: "Indoors",
};

const atmosphereLabels: Record<Atmosphere, string> = {
  CLEAR: "Clear",
  FOG: "Fog",
  RAIN: "Rain",
  SNOW: "Snow",
  NEON: "Neon",
  LOW_LIGHT: "Low light",
  OVERCAST: "Overcast",
};

const trainingTypes: Array<NonNullable<ExperienceSettings["trainingType"]>> = [
  "STAMINA",
  "BOUNCE_ENDURANCE",
  "SPEED_BURSTS",
  "LONG_STEADY",
  "MIXED_MODE",
];

const progressViewOptions: Array<{
  label: string;
  value: ExperienceSettings["progressView"];
}> = [
  { label: "Streaks", value: "STREAKS" },
  { label: "Time in zone", value: "TIME_IN_ZONE" },
  { label: "Segments", value: "SEGMENTS" },
  { label: "Minimal", value: "MINIMAL" },
];

const musicSyncOptions: Array<{
  label: string;
  value: ExperienceSettings["musicSyncMode"];
}> = [
  { label: "Match to BPM", value: "BPM" },
  { label: "Match to heart rate", value: "HEART_RATE" },
  { label: "Don't match anything", value: "NONE" },
  { label: "Let RV decide", value: "AUTO" },
];

const feedbackOptions: Array<{
  label: string;
  value: ExperienceSettings["feedbackMode"];
}> = [
  { label: "Silent", value: "SILENT" },
  { label: "Heads-up", value: "HEADS_UP" },
  { label: "Full feedback", value: "FULL_FEEDBACK" },
];

const clipDurationOptions: Array<{
  label: string;
  value: ExperienceSettings["clipDurationPreference"];
}> = [
  { label: "Short (15–30s)", value: "SHORT" },
  { label: "Medium (45–90s)", value: "MEDIUM" },
  { label: "Long (2–5m)", value: "LONG" },
  { label: "Mixed", value: "MIXED" },
];

export const ExperienceGoalsPage: React.FC = () => {
  const {
    settings,
    setSettings,
    runStats,
    closeExperiencePage,
    profiles,
    activeProfileId,
    saveProfile,
    saveProfileAsNew,
    loadProfile,
  } = useExperience();

  const isTrainingVisible = settings.focusMode !== "ESCAPE";

  const updateSettings = <K extends keyof ExperienceSettings>(
    key: K,
    value: ExperienceSettings[K]
  ) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleAllowedSourceToggle = (source: SourceFootageType) => {
    setSettings((prev) => ({
      ...prev,
      allowedSources: toggleValue(prev.allowedSources, source),
    }));
  };

  const handleTimeOfDayToggle = (value: TimeOfDay) => {
    setSettings((prev) => ({
      ...prev,
      timeOfDay: toggleValue(prev.timeOfDay, value),
    }));
  };

  const handleAtmosphereToggle = (value: Atmosphere) => {
    setSettings((prev) => ({
      ...prev,
      atmosphere: toggleValue(prev.atmosphere, value),
    }));
  };

  const handleNoGoToggle = (key: keyof NoGoFilters) => {
    setSettings((prev) => ({
      ...prev,
      noGoFilters: { ...prev.noGoFilters, [key]: !prev.noGoFilters[key] },
    }));
  };

  const progressFraction = Math.min(
    1,
    runStats.sessionDurationSeconds
      ? runStats.timeInTargetZoneSeconds / runStats.sessionDurationSeconds
      : 0
  );

  const goalName =
    runStats.currentGoalName || settings.trainingType || settings.focusMode;

  return (
    <div style={pageStyle} role="dialog" aria-modal="true">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div>
          <p style={{ textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
            Experience & Goals
          </p>
          <h1 style={{ margin: "4px 0 0" }}>{goalName}</h1>
          <p style={{ margin: "6px 0 0", color: "#cbd5f5" }}>
            Current profile: {settings.profileName ?? "Untitled profile"}
          </p>
        </div>
        <button
          onClick={closeExperiencePage}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.3)",
            padding: "8px 16px",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
            height: 40,
            alignSelf: "flex-start",
          }}
        >
          Close
        </button>
      </header>
      <div style={contentStyle}>
        <div style={configColumnStyle}>
          <Section title="What is today about?">
            <div style={optionGridStyle}>
              {(Object.keys(focusModeLabels) as ExperienceFocusMode[]).map(
                (mode) => (
                  <label key={mode} style={chipStyle}>
                    <input
                      type="radio"
                      name="focusMode"
                      value={mode}
                      checked={settings.focusMode === mode}
                      onChange={() => updateSettings("focusMode", mode)}
                    />
                    {focusModeLabels[mode]}
                  </label>
                )
              )}
            </div>
          </Section>

          <Section title="Camera movement">
            <div style={optionGridStyle}>
              {(Object.keys(cameraMovementLabels) as CameraMovementPreference[]).map(
                (movement) => (
                  <label key={movement} style={chipStyle}>
                    <input
                      type="radio"
                      name="cameraMovement"
                      value={movement}
                      checked={settings.cameraMovement === movement}
                      onChange={() => updateSettings("cameraMovement", movement)}
                    />
                    {cameraMovementLabels[movement]}
                    {movement === "ALWAYS_MOVING" &&
                      settings.cameraMovement === "ALWAYS_MOVING" && (
                      <span style={{ fontSize: 12, color: "#cbd5f5" }}>
                        Filters clips where the camera stops moving.
                      </span>
                    )}
                  </label>
                )
              )}
            </div>
          </Section>

          <Section title="Where do you want to feel like you are?">
            <div style={optionGridStyle}>
              <label style={chipStyle}>
                <input
                  type="radio"
                  name="locationEnvironment"
                  value="INDOOR"
                  checked={settings.locationEnvironment === "INDOOR"}
                  onChange={() => updateSettings("locationEnvironment", "INDOOR")}
                />
                Indoor
              </label>
              <label style={chipStyle}>
                <input
                  type="radio"
                  name="locationEnvironment"
                  value="OUTDOOR"
                  checked={settings.locationEnvironment === "OUTDOOR"}
                  onChange={() => updateSettings("locationEnvironment", "OUTDOOR")}
                />
                Outdoor
              </label>
              <label style={chipStyle}>
                <input
                  type="radio"
                  name="locationEnvironment"
                  value="BOTH"
                  checked={settings.locationEnvironment === "BOTH"}
                  onChange={() => updateSettings("locationEnvironment", "BOTH")}
                />
                Both
              </label>
            </div>
            <div style={optionGridStyle}>
              {(["EMPTY", "FEW", "CROWDED", "PACKED"] as const).map((density) => (
                <label key={density} style={chipStyle}>
                  <input
                    type="radio"
                    name="peopleDensity"
                    value={density}
                    checked={settings.peopleDensity === density}
                    onChange={() => updateSettings("peopleDensity", density)}
                  />
                  People: {density.toLowerCase()}
                </label>
              ))}
            </div>
            <div style={optionGridStyle}>
              {(["URBAN", "SUBURBAN", "RURAL", "MIXED"] as const).map((urbanity) => (
                <label key={urbanity} style={chipStyle}>
                  <input
                    type="radio"
                    name="urbanity"
                    value={urbanity}
                    checked={settings.urbanity === urbanity}
                    onChange={() => updateSettings("urbanity", urbanity)}
                  />
                  {urbanity.toLowerCase()}
                </label>
              ))}
            </div>
            <div style={optionGridStyle}>
              {(["NATURE_HEAVY", "BALANCED", "BUILT_HEAVY"] as const).map((value) => (
                <label key={value} style={chipStyle}>
                  <input
                    type="radio"
                    name="naturalVsBuilt"
                    value={value}
                    checked={settings.naturalVsBuilt === value}
                    onChange={() => updateSettings("naturalVsBuilt", value)}
                  />
                  {value.replace("_", " ").toLowerCase()}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Allowed footage types">
            <div style={optionGridStyle}>
              {(Object.keys(allowedSourceLabels) as SourceFootageType[]).map((source) => (
                <label key={source} style={chipStyle}>
                  <input
                    type="checkbox"
                    checked={settings.allowedSources.includes(source)}
                    onChange={() => handleAllowedSourceToggle(source)}
                  />
                  {allowedSourceLabels[source]}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Scene style details">
            <div>
              <p style={{ marginBottom: 8, color: "#cbd5f5" }}>Time of day</p>
              <div style={optionGridStyle}>
                {(Object.keys(timeOfDayLabels) as TimeOfDay[]).map((value) => (
                  <label key={value} style={chipStyle}>
                    <input
                      type="checkbox"
                      checked={settings.timeOfDay.includes(value)}
                      onChange={() => handleTimeOfDayToggle(value)}
                    />
                    {timeOfDayLabels[value]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p style={{ marginBottom: 8, color: "#cbd5f5" }}>Atmosphere</p>
              <div style={optionGridStyle}>
                {(Object.keys(atmosphereLabels) as Atmosphere[]).map((value) => (
                  <label key={value} style={chipStyle}>
                    <input
                      type="checkbox"
                      checked={settings.atmosphere.includes(value)}
                      onChange={() => handleAtmosphereToggle(value)}
                    />
                    {atmosphereLabels[value]}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Music sync preferences">
            <div style={optionGridStyle}>
              {musicSyncOptions.map((option) => (
                <label key={option.value} style={chipStyle}>
                  <input
                    type="radio"
                    name="musicSyncMode"
                    value={option.value}
                    checked={settings.musicSyncMode === option.value}
                    onChange={() => updateSettings("musicSyncMode", option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Section>

          {isTrainingVisible && (
            <Section title="Training goal">
              <div style={optionGridStyle}>
                {trainingTypes.map((type) => (
                  <label key={type} style={chipStyle}>
                    <input
                      type="radio"
                      name="trainingType"
                      value={type}
                      checked={settings.trainingType === type}
                      onChange={() => updateSettings("trainingType", type)}
                    />
                    {type.replace("_", " ").toLowerCase()}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={chipStyle}>
                  <input
                    type="radio"
                    name="hrBandMode"
                    value="ABOVE"
                    checked={settings.heartRateBand?.mode === "ABOVE"}
                    onChange={() =>
                      updateSettings("heartRateBand", {
                        mode: "ABOVE",
                        min: settings.heartRateBand?.min ?? 150,
                      })
                    }
                  />
                  Keep me above
                  <input
                    type="number"
                    min={60}
                    max={210}
                    style={{ width: 64 }}
                    value={settings.heartRateBand?.min ?? ""}
                    onChange={(event) =>
                      updateSettings("heartRateBand", {
                        mode: "ABOVE",
                        min: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ ...chipStyle, flexWrap: "wrap" }}>
                  <input
                    type="radio"
                    name="hrBandMode"
                    value="RANGE"
                    checked={settings.heartRateBand?.mode === "RANGE"}
                    onChange={() =>
                      updateSettings("heartRateBand", {
                        mode: "RANGE",
                        min: settings.heartRateBand?.min ?? 135,
                        max: settings.heartRateBand?.max ?? 158,
                      })
                    }
                  />
                  Keep me between
                  <input
                    type="number"
                    min={60}
                    max={210}
                    style={{ width: 64 }}
                    value={settings.heartRateBand?.min ?? ""}
                    onChange={(event) =>
                      updateSettings("heartRateBand", {
                        mode: "RANGE",
                        min: Number(event.target.value),
                        max: settings.heartRateBand?.max,
                      })
                    }
                  />
                  –
                  <input
                    type="number"
                    min={60}
                    max={210}
                    style={{ width: 64 }}
                    value={settings.heartRateBand?.max ?? ""}
                    onChange={(event) =>
                      updateSettings("heartRateBand", {
                        mode: "RANGE",
                        min: settings.heartRateBand?.min,
                        max: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={chipStyle}>
                  <input
                    type="radio"
                    name="hrBandMode"
                    value="AUTO"
                    checked={settings.heartRateBand?.mode === "AUTO"}
                    onChange={() =>
                      updateSettings("heartRateBand", {
                        mode: "AUTO",
                      })
                    }
                  />
                  Let RV choose from my history
                </label>
              </div>
              <div style={optionGridStyle}>
                {progressViewOptions.map((option) => (
                  <label key={option.value} style={chipStyle}>
                    <input
                      type="radio"
                      name="progressView"
                      value={option.value}
                      checked={settings.progressView === option.value}
                      onChange={() => updateSettings("progressView", option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </Section>
          )}

          <Section title="Mid-run behavior">
            <div style={optionGridStyle}>
              {feedbackOptions.map((option) => (
                <label key={option.value} style={chipStyle}>
                  <input
                    type="radio"
                    name="feedbackMode"
                    value={option.value}
                    checked={settings.feedbackMode === option.value}
                    onChange={() => updateSettings("feedbackMode", option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <label style={{ ...chipStyle, width: "fit-content" }}>
              <input
                type="checkbox"
                checked={settings.neverAskDuringRun}
                onChange={(event) =>
                  updateSettings("neverAskDuringRun", event.target.checked)
                }
              />
              Never ask questions during the run
            </label>
          </Section>

          <Section title="Clip duration preferences">
            <div style={optionGridStyle}>
              {clipDurationOptions.map((option) => (
                <label key={option.value} style={chipStyle}>
                  <input
                    type="radio"
                    name="clipDurationPreference"
                    value={option.value}
                    checked={settings.clipDurationPreference === option.value}
                    onChange={() =>
                      updateSettings("clipDurationPreference", option.value)
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="No-go content filters">
            <div style={optionGridStyle}>
              {noGoEntries.map((entry) => (
                <label key={entry.key} style={chipStyle}>
                  <input
                    type="checkbox"
                    checked={settings.noGoFilters[entry.key]}
                    onChange={() => handleNoGoToggle(entry.key)}
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Profile save & load" description="Save presets for future runs.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Profile name</span>
                <input
                  type="text"
                  value={settings.profileName ?? ""}
                  onChange={(event) =>
                    updateSettings(
                      "profileName",
                      event.target.value ? event.target.value : undefined
                    )
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.2)",
                    color: "#fff",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span>Existing profiles</span>
                <select
                  value={activeProfileId ?? ""}
                  onChange={(event) => loadProfile(event.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.2)",
                    color: "#fff",
                  }}
                >
                  {!activeProfileId && (
                    <option value="" disabled>
                      Choose a profile
                    </option>
                  )}
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => saveProfile()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "none",
                  background: "#38bdf8",
                  color: "#041016",
                  cursor: "pointer",
                }}
              >
                Save profile
              </button>
              <button
                type="button"
                onClick={() => saveProfileAsNew()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Save as new
              </button>
            </div>
          </Section>
        </div>
        <aside style={statsColumnStyle} aria-label="Live stats panel">
          <h2 style={{ marginTop: 0 }}>Live goal stats</h2>
          <p style={{ margin: "4px 0 16px", color: "#cbd5f5" }}>
            Tracking: {goalName}
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <p style={{ margin: 0, color: "#cbd5f5" }}>Current heart rate</p>
              <strong style={{ fontSize: 32 }}>
                {runStats.currentHeartRate ? `${runStats.currentHeartRate} bpm` : "--"}
              </strong>
            </div>
            <div>
              <p style={{ margin: 0, color: "#cbd5f5" }}>Session duration</p>
              <strong style={{ fontSize: 20 }}>
                {formatDuration(runStats.sessionDurationSeconds)}
              </strong>
            </div>
            <div>
              <p style={{ margin: 0, color: "#cbd5f5" }}>Time in target zone</p>
              <strong style={{ fontSize: 20 }}>
                {formatDuration(runStats.timeInTargetZoneSeconds)}
              </strong>
              <div
                style={{
                  marginTop: 8,
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: 999,
                  height: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progressFraction * 100)}%`,
                    background: "#34d399",
                    height: "100%",
                  }}
                />
              </div>
            </div>
            <div>
              <p style={{ margin: 0, color: "#cbd5f5" }}>Longest streak</p>
              <strong style={{ fontSize: 20 }}>
                {formatDuration(runStats.longestStreakSeconds)}
              </strong>
            </div>
            {settings.trainingType === "BOUNCE_ENDURANCE" && runStats.bounceEnduranceMinutes && (
              <div>
                <p style={{ margin: 0, color: "#cbd5f5" }}>Bounce endurance</p>
                <strong style={{ fontSize: 20 }}>
                  {runStats.bounceEnduranceMinutes} minutes
                </strong>
              </div>
            )}
            <div>
              <p style={{ margin: 0, color: "#cbd5f5" }}>Progress view</p>
              <strong style={{ fontSize: 18 }}>{settings.progressView}</strong>
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 8 }}>Recent sessions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(runStats.history ?? []).map((session) => (
                <div
                  key={session.date}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    paddingBottom: 6,
                  }}
                >
                  <div>
                    <strong>{new Date(session.date).toLocaleDateString()}</strong>
                    <p style={{ margin: 0, color: "#cbd5f5" }}>
                      {formatDuration(session.durationSeconds)} total
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0 }}>Zone: {formatDuration(session.timeInTargetZoneSeconds)}</p>
                    <p style={{ margin: 0, color: "#cbd5f5" }}>
                      Streak: {formatDuration(session.longestStreakSeconds)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
