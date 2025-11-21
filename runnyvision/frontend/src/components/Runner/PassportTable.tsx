import { RunSession } from "../../../../shared/types";

type Props = {
  runs: RunSession[];
};

function formatPlaces(places: string[]): string {
  return places.join(" → ");
}

export default function PassportTable({ runs }: Props) {
  if (!runs.length) return <p>Your passport is empty. Log a run to see it here.</p>;

  return (
    <div className="table-wrapper">
      <table className="passport-table">
        <thead>
          <tr>
            <th className="text-right">Steps</th>
            <th>Trip</th>
            <th className="text-right">Miles</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="text-right">{run.steps.toLocaleString()} steps</td>
              <td className="trip-cell">{formatPlaces(run.places)}</td>
              <td className="text-right">{run.fakeMiles.toLocaleString()} miles</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
