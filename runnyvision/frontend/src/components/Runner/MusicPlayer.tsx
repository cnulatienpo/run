export default function MusicPlayer() {
  return (
    <div className="viewer-box" style={{ background: "#111827", color: "#e5e7eb" }}>
      <div className="badge">Soundscape</div>
      <p style={{ margin: "6px 0" }}>
        Imagine synth waves that keep pace with your steps. (Audio hooks not wired in this demo.)
      </p>
      <button className="button" type="button" style={{ width: "fit-content" }}>
        Play motivating track
      </button>
    </div>
  );
}
