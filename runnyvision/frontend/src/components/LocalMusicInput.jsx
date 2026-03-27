import { loadFiles, getState, subscribe } from "../utils/audioController";
import { useEffect, useState } from "react";

export default function LocalMusicInput() {
  const [state, setState] = useState(getState());

  useEffect(() => subscribe(setState), []);

  const handleChange = (event) => {
    loadFiles(event.target.files);
  };

  return (
    <div>
      <input type="file" multiple accept="audio/*" onChange={handleChange} />
      <p style={{ margin: "8px 0 0 0", fontSize: "0.9rem" }}>
        {state.currentTrack ? `Current: ${state.currentTrack.name}` : "No track loaded"}
      </p>
    </div>
  );
}
