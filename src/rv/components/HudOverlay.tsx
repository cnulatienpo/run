import React from "react";
import { useExperience } from "../context/ExperienceProvider";

const hudContainerStyle: React.CSSProperties = {
  position: "fixed",
  top: 24,
  right: 24,
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(5, 5, 5, 0.72)",
  color: "#f7fafc",
  minWidth: 200,
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

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

export const HudOverlay: React.FC = () => {
  const { runStats, openExperiencePage } = useExperience();
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
        <strong>{runStats.currentHeartRate ?? "--"} bpm</strong>
      </div>
      <div style={statsRowStyle}>
        <span>Time in zone</span>
        <strong>{formatDuration(runStats.timeInTargetZoneSeconds)}</strong>
      </div>
      <div style={statsRowStyle}>
        <span>Session</span>
        <strong>{formatDuration(runStats.sessionDurationSeconds)}</strong>
      </div>
    </div>
  );
};
