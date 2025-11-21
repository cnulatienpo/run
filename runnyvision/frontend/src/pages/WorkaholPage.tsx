import { useEffect, useState } from "react";
import { RouteConfig } from "../../../shared/types";
import RouteList from "../components/Workahol/RouteList";
import RouteForm from "../components/Workahol/RouteForm";
import { fetchRoutes } from "../api/routesApi";

export default function WorkaholPage() {
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRoutes = () => {
    setLoading(true);
    fetchRoutes()
      .then((data) => setRoutes(data))
      .catch(() => setError("Failed to load routes"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  return (
    <div className="form-grid">
      <div className="page-card">
        <h2 className="section-title">Create a new journey</h2>
        <RouteForm onCreated={() => loadRoutes()} />
        {error && <p style={{ color: "#b91c1c", margin: "8px 0 0" }}>{error}</p>}
      </div>

      <div className="page-card">
        <h2 className="section-title">All routes</h2>
        {loading ? <p>Loading routes...</p> : <RouteList routes={routes} />}
      </div>
    </div>
  );
}
