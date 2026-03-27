import { useEffect, useState } from "react";
import { getState, play, pause, playRandom, subscribe } from "../utils/audioController";

export default function AudioControls() {
  const [state, setState] = useState(getState());

  useEffect(() => subscribe(setState), []);

  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
      <button className="button" type="button" onClick={play} disabled={!state.isLoaded}>
        PLAY
      </button>
      <button className="button" type="button" onClick={pause} disabled={!state.isLoaded}>
        PAUSE
      </button>
      <button className="button" type="button" onClick={playRandom} disabled={!state.isLoaded}>
        RANDOM
      </button>
    </div>
  );
}
