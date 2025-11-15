// src/passport/createStamp.ts
import { SessionLog, PassportStamp } from "./types";

function toDateOnly(iso: string): string {
  // Expecting iso string; safely slice to "yyyy-mm-dd" if valid
  try {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fall through
  }
  // fallback: best-effort split
  const idx = iso.indexOf("T");
  return idx > 0 ? iso.slice(0, idx) : iso;
}

function pickSwatchColorFromMood(mood: string, pack: string): string {
  const key = mood.toLowerCase();
  if (key.includes("dream")) return "#7d5cff";
  if (key.includes("night")) return "#1f2937";
  if (key.includes("neon")) return "#f97316";
  if (key.includes("chill")) return "#0ea5e9";

  const pk = pack.toLowerCase();
  if (pk.includes("urban")) return "#6b7280";
  if (pk.includes("forest")) return "#16a34a";

  return "#4b5563";
}

export interface StampOptions {
  userNote?: string;
  emojis?: string[];
  autoNote: string;        // required
  appVersion?: string;
}

export function makePassportStampFromSession(
  session: SessionLog,
  options: StampOptions
): PassportStamp {
  const hasUserNote = !!options.userNote && options.userNote.trim().length > 0;
  const note = hasUserNote ? options.userNote!.trim() : options.autoNote;
  const dateOnly = toDateOnly(session.startedAt);
  const createdAt = new Date().toISOString();

  return {
    stampId: `${session.id}_${dateOnly}`,
    sessionId: session.id,
    date: dateOnly,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    routeId: session.routeId,
    routeLabel: session.routeLabel,
    miles: session.miles,
    mood: session.mood,
    pack: session.pack,
    note,
    noteSource: hasUserNote ? "user" : "auto",
    emojis: options.emojis ?? [],
    thumbnailUrl: null, // v1: no screenshots yet
    swatchColor: pickSwatchColorFromMood(session.mood, session.pack),
    createdAt,
    appVersion: options.appVersion,
  };
}
