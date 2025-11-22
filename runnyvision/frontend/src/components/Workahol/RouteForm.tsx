import { FormEvent, useState } from "react";
import { createRoute } from "../../api/routesApi";
import { RouteConfig } from "../../../../shared/types";

type Props = {
  onCreated: (route: RouteConfig) => void;
};

export default function RouteForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [placesRaw, setPlacesRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const places = placesRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (!places.length) {
      setError("Please provide at least one place.");
      return;
    }

    try {
      setSaving(true);
      const route = await createRoute({ name, videoUrl, places });
      onCreated(route);
      setName("");
      setVideoUrl("");
      setPlacesRaw("");
    } catch (err) {
      console.error(err);
      setError("Failed to create route");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="route-name" style={{ fontWeight: 700 }}>
          Route name
        </label>
        <input id="route-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="video-url" style={{ fontWeight: 700 }}>
          Video URL
        </label>
        <input
          id="video-url"
          className="input"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="places" style={{ fontWeight: 700 }}>
          Places (comma separated)
        </label>
        <input
          id="places"
          className="input"
          placeholder="Boston, Tokyo, Stormwind"
          value={placesRaw}
          onChange={(e) => setPlacesRaw(e.target.value)}
          required
        />
      </div>
      {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Create route"}
      </button>
    </form>
  );
}
