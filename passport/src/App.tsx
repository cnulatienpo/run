import React, { useEffect, useMemo, useState } from "react";
import { createSession, fetchSessions } from "./api";
import { SessionForm } from "./components/SessionForm";
import { SessionTable } from "./components/SessionTable";
import { RunSession } from "./types";

function groupByDay(sessions: RunSession[]) {
  const today = new Date();
  return sessions.reduce(
    (acc, session) => {
      const date = new Date(session.createdAt);
      const isToday = date.toDateString() === today.toDateString();
      if (isToday) acc.today += session.steps;
      else acc.earlier += session.steps;
      return acc;
    },
    { today: 0, earlier: 0 }
  );
}

export default function App() {
  const [sessions, setSessions] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => groupByDay(sessions), [sessions]);

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (data: { steps: number; places: string[] }) => {
    setSubmitting(true);
    try {
      const session = await createSession(data);
      setSessions((prev) => [session, ...prev]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>RunnyVision</h1>
        <p>Track every session with a passport table that mixes real steps with official-looking miles.</p>
        <div className="badge" style={{ background: "rgba(16,185,129,0.16)", color: "#a7f3d0" }}>
          {totals.today.toLocaleString()} steps today · {totals.earlier.toLocaleString()} earlier
        </div>
      </header>
      <div className="grid" style={{ gap: "1.25rem" }}>
        <SessionForm onSubmit={handleSubmit} loading={submitting} />
        {error && (
          <div className="card" style={{ border: "1px solid rgba(248,113,113,0.4)" }}>
            <p style={{ color: "#fca5a5" }}>{error}</p>
          </div>
        )}
        {loading ? <p className="subtitle">Loading sessions…</p> : <SessionTable sessions={sessions} />}
      </div>
    </main>
  );
}
