import { RouteConfig } from "../../../../shared/types";

type Props = {
  route: RouteConfig;
};

export default function PlacesEditor({ route }: Props) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {route.places.map((place, idx) => (
        <span key={`${place}-${idx}`} className="route-pill">
          <span className="dot" />
          {place}
        </span>
      ))}
    </div>
  );
}
