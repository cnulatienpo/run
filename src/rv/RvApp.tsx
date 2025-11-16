import React from "react";
import { ExperienceProvider, useExperience } from "./context/ExperienceProvider";
import { HudOverlay } from "./components/HudOverlay";
import { ExperienceGoalsPage } from "./pages";
import { TelemetryProvider } from "../telemetry/TelemetryContext";

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top, #0f172a, #020617)",
  color: "#fff",
};

const TelemetryBridge: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { settings } = useExperience();
  return <TelemetryProvider heartRateBand={settings.heartRateBand}>{children}</TelemetryProvider>;
};

const ShellContent: React.FC = () => {
  const { isExperiencePageOpen } = useExperience();
  return (
    <div style={shellStyle}>
      <HudOverlay />
      {isExperiencePageOpen && <ExperienceGoalsPage />}
    </div>
  );
};

export const RvApp: React.FC = () => (
  <ExperienceProvider>
    <TelemetryBridge>
      <ShellContent />
    </TelemetryBridge>
  </ExperienceProvider>
);
