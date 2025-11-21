import { FormEvent, useCallback, useEffect, useState } from "react";
import { RouteConfig, RunSession } from "../../../shared/types";
import RouteSelector from "../components/Runner/RouteSelector";
import Viewer from "../components/Runner/Viewer";
import MusicPlayer from "../components/Runner/MusicPlayer";
import PassportTable from "../components/Runner/PassportTable";
import { createRun, fetchPassport } from "../api/runsApi";

const DEMO_USER = "demo-user";

export default function RunnerPage() {
  const [selectedRoute, setSelectedRoute] = useState<RouteConfig | null>(null);
  const [steps, setSteps] = useState<number>(1200);
  const [customPlaces, setCustomPlaces] = useState("");
  const [passport, setPassport] = useState<RunSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPassport = useCallback(() => {
    fetchPassport(DEMO_USER)
      .then(setPassport)
      .catch(() => setError("Failed to load passport"));
  }, []);

  useEffect(() => {
    loadPassport();
  }, [loadPassport]);

  const handleRun = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const places = customPlaces
      ? customPlaces
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : selectedRoute?.places ?? [];

    if (!places.length) {
      setError("Choose a route or enter at least one place.");
      return;
    }

    try {
      setSaving(true);
      await createRun(DEMO_USER, steps, places);
      setCustomPlaces("");
      loadPassport();
    } catch (err) {
      console.error(err);
      setError("Failed to log run");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-grid">
      <div className="page-card">
        <h2 className="section-title">Route and vibes</h2>
        <RouteSelector onSelect={setSelectedRoute} />
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <Viewer route={selectedRoute} />
          <MusicPlayer />
        </div>
      </div>

      <div className="page-card">
        <h2 className="section-title">Log a demo run</h2>
        <form className="form-grid" onSubmit={handleRun}>
          <div>
            <label htmlFor="steps" style={{ fontWeight: 700 }}>
              Steps walked
            </label>
            <input
              id="steps"
              type="number"
              min={0}
              className="input"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label htmlFor="custom-places" style={{ fontWeight: 700 }}>
              Custom places (override route, comma separated)
            </label>
            <input
              id="custom-places"
              className="input"
              placeholder="Roadblocks, New York, World of Warcraft Castles, St. Louis"
              value={customPlaces}
              onChange={(e) => setCustomPlaces(e.target.value)}
            />
          </div>
          {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Calculating miles..." : "Log run"}
          </button>
        </form>
      </div>

      <div className="page-card">
        <h2 className="section-title">Passport for {DEMO_USER}</h2>
        <PassportTable runs={passport} />
      </div>
    </div>
  );
}
