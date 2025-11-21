import React from "react";
import { RunSession } from "../types";

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatTrip(places: string[]) {
  return places.join(" \u2192 ");
}

export function SessionTable({ sessions }: { sessions: RunSession[] }) {
  if (!sessions.length) {
    return <p className="subtitle">No sessions yet. Add your first passport stamp above.</p>;
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div className="header-row">
        <div>
          <h2>Passport Table</h2>
          <p className="subtitle">One row per session. Steps are real. Miles look official.</p>
        </div>
        <span className="badge">{sessions.length} sessions</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Steps</th>
              <th style={{ minWidth: 260 }}>Trip</th>
              <th style={{ minWidth: 140 }}>Miles</th>
              <th style={{ minWidth: 160 }}>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{formatNumber(session.steps)} steps</td>
                <td>{formatTrip(session.places)}</td>
                <td>{formatNumber(session.fakeMiles)} miles</td>
                <td>{new Date(session.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
