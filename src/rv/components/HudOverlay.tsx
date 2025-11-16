import React, { useState } from "react";
import { useExperience } from "../context/ExperienceProvider";
import { useTelemetry } from "../../telemetry/TelemetryContext";

const hudContainerStyle: React.CSSProperties = {
  position: "fixed",
  top: 24,
  right: 24,
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(5, 5, 5, 0.72)",
  color: "#f7fafc",
  minWidth: 240,
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
  zIndex: 1000,
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  marginTop: 4,
};

const buttonStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  background: "rgba(12, 12, 12, 0.8)",
  color: "#fff",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "--";
  }
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const HudOverlay: React.FC = () => {
  const { settings, openExperiencePage } = useExperience();
  const { state, start, stop, isRunning } = useTelemetry();
  const [isPending, setIsPending] = useState(false);

  const handleToggleSession = async () => {
    if (isPending) {
      return;
    }
    setIsPending(true);
    try {
      if (isRunning) {
        await stop();
      } else {
        await start({
          trainingType: settings.trainingType,
          goalName: settings.profileName,
        });
      }
    } catch (error) {
      console.error("[HudOverlay] Failed to toggle run session", error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div style={hudContainerStyle} role="region" aria-label="Run HUD overlay">
      <button
        style={buttonStyle}
        onClick={openExperiencePage}
        aria-label="Open experience & goals settings"
      >
        XP
      </button>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
        Live stats
      </div>
      <div style={statsRowStyle}>
        <span>Heart rate</span>
        <strong>{state.currentHeartRate ?? "--"} bpm</strong>
      </div>
      <div style={statsRowStyle}>
        <span>Time in zone</span>
        <strong>{formatDuration(state.timeInTargetZoneSeconds)}</strong>
      </div>
      <div style={statsRowStyle}>
        <span>Session</span>
        <strong>{formatDuration(state.sessionDurationSeconds)}</strong>
      </div>
      <div style={statsRowStyle}>
        <span>Target zone</span>
        <strong>{state.inTargetZone ? "In" : "Out"}</strong>
      </div>
      <div style={statsRowStyle}>
        <span>Last update</span>
        <strong>{formatTimestamp(state.lastSampleTimestamp)}</strong>
      </div>
      <button
        style={{
          ...primaryButtonStyle,
          background: isRunning ? "#f87171" : "#22c55e",
          color: "#0f0f0f",
          opacity: isPending ? 0.7 : 1,
        }}
        onClick={handleToggleSession}
        disabled={isPending}
      >
        {isRunning ? "Stop session" : "Start session"}
      </button>
    </div>
  );
};
