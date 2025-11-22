import React, { useState } from "react";

interface Props {
  onSubmit: (data: { steps: number; places: string[] }) => Promise<void>;
  loading: boolean;
}

export function SessionForm({ onSubmit, loading }: Props) {
  const [steps, setSteps] = useState("3000");
  const [places, setPlaces] = useState("Boston, Tokyo");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsedSteps = Number(steps);
    const parsedPlaces = places
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (!Number.isFinite(parsedSteps) || parsedSteps <= 0) {
      setError("Steps must be a positive number");
      return;
    }

    if (parsedPlaces.length === 0) {
      setError("Add at least one place for your passport stamp");
      return;
    }

    try {
      await onSubmit({ steps: parsedSteps, places: parsedPlaces });
      setSteps("3000");
      setPlaces("Boston, Tokyo");
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="header-row">
        <div>
          <h2>Log a Run</h2>
          <p className="subtitle">
            Steps are real. Miles look official. Every place counts — real or imaginary.
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid">
        <label>
          Steps
          <input
            type="number"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="2,500"
            min={1}
            required
          />
        </label>
        <label>
          Places visited (comma separated)
          <textarea
            value={places}
            onChange={(e) => setPlaces(e.target.value)}
            placeholder="Boston, Tokyo"
          />
        </label>
        <div>
          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add Session"}
          </button>
        </div>
      </form>
      {error && <p style={{ color: "#fca5a5", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}
