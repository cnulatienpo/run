import React from "react";
import { ExperienceProvider, useExperience } from "./context/ExperienceProvider";
import { HudOverlay } from "./components/HudOverlay";
import { ExperienceGoalsPage } from "./pages";

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top, #0f172a, #020617)",
  color: "#fff",
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
    <ShellContent />
  </ExperienceProvider>
);
