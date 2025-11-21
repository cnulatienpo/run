import { useEffect, useState } from "react";
import { RouteConfig } from "../../../../shared/types";
import { fetchRoutes } from "../../api/routesApi";

type Props = {
  onSelect: (route: RouteConfig | null) => void;
};

export default function RouteSelector({ onSelect }: Props) {
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes()
      .then((data) => {
        setRoutes(data);
        const first = data[0] ?? null;
        setSelectedId(first?.id ?? null);
        onSelect(first ?? null);
      })
      .catch(() => setError("Failed to load routes"))
      .finally(() => setLoading(false));
  }, [onSelect]);

  const handleChange = (id: string) => {
    setSelectedId(id);
    const route = routes.find((r) => r.id === id) ?? null;
    onSelect(route);
  };

  if (loading) return <p>Loading routes...</p>;
  if (error) return <p>{error}</p>;
  if (!routes.length) return <p>No routes yet. Visit Workahol Enabler to add some.</p>;

  return (
    <div className="form-grid">
      <label htmlFor="route-select" style={{ fontWeight: 700 }}>
        Choose a route
      </label>
      <select
        id="route-select"
        className="input"
        value={selectedId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
      >
        {routes.map((route) => (
          <option key={route.id} value={route.id}>
            {route.name}
          </option>
        ))}
      </select>
    </div>
  );
}
