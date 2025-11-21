import { RouteConfig } from "../../../../shared/types";
import PlacesEditor from "./PlacesEditor";

type Props = {
  routes: RouteConfig[];
};

export default function RouteList({ routes }: Props) {
  if (!routes.length) return <p>No routes yet. Create one to start curating journeys.</p>;

  return (
    <div className="form-grid">
      {routes.map((route) => (
        <div key={route.id} className="page-card" style={{ margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: "0 0 6px" }}>{route.name}</h3>
              <p style={{ margin: 0, color: "#4a6287" }}>Video URL: {route.videoUrl}</p>
            </div>
            <span className="badge">{new Date(route.createdAt).toLocaleString()}</span>
          </div>
          <div style={{ marginTop: "10px" }}>
            <PlacesEditor route={route} />
          </div>
        </div>
      ))}
    </div>
  );
}
