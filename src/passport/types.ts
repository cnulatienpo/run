// src/passport/types.ts
export interface SessionLog {
  id: string;              // unique session id
  startedAt: string;       // ISO datetime
  endedAt: string;         // ISO datetime
  routeId: string;         // e.g. "seoul_paris"
  routeLabel: string;      // e.g. "Seoul → Paris"
  miles: number;           // distance for this session
  mood: string;            // e.g. "Dreamcore"
  pack: string;            // e.g. "Urban"
  // The app can have more fields, but you do not need them for the Passport.
}

export type NoteSource = "user" | "auto";

export interface PassportStamp {
  // identity / linkage
  stampId: string;        // e.g. `${sessionId}_${date}`
  sessionId: string;

  // date / time
  date: string;           // "yyyy-mm-dd"
  startedAt: string;      // ISO
  endedAt: string;        // ISO

  // route info
  routeId: string;
  routeLabel: string;

  // movement
  miles: number;

  // vibe
  mood: string;
  pack: string;

  // diary text
  note: string;
  noteSource: NoteSource;
  emojis: string[];

  // visual garnish
  thumbnailUrl?: string | null;
  swatchColor?: string;

  // housekeeping
  createdAt: string;      // ISO
  appVersion?: string;
}

export interface PassportStore {
  version: 1;
  stamps: PassportStamp[];
}
