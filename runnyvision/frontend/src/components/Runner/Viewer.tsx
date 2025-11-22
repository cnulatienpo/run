import { RouteConfig } from "../../../../shared/types";

type Props = {
  route: RouteConfig | null;
};

export default function Viewer({ route }: Props) {
  if (!route) return <div className="viewer-box">Pick a route to preview the journey.</div>;

  return (
    <div className="viewer-box">
      <div className="badge">Route preview</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{route.name}</strong>
          <p style={{ margin: "6px 0", color: "#9fb6e8" }}>Video feed: {route.videoUrl}</p>
        </div>
        <span className="badge" aria-label="places count">
          {route.places.length} stops
        </span>
      </div>
      <div>
        {route.places.map((place, idx) => (
          <span className="route-pill" key={`${place}-${idx}`}>
            <span className="dot" aria-hidden />
            {place}
          </span>
        ))}
      </div>
    </div>
  );
}
