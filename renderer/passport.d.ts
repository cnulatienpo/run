export interface SessionLog {
  id: string;
  startedAt: string;
  endedAt: string;
  routeId: string;
  routeLabel: string;
  miles: number;
  mood: string;
  pack: string;
}

export interface PassportStamp {
  stampId: string;
  sessionId: string;
  date: string;
  startedAt: string;
  endedAt: string;
  routeId: string;
  routeLabel: string;
  miles: number;
  mood: string;
  pack: string;
  note: string;
  noteSource: 'user' | 'auto';
  emojis: string[];
  thumbnailUrl?: string;
  swatchColor?: string;
  createdAt: string;
  appVersion?: string;
}

export interface PassportStore {
  version: 1;
  stamps: PassportStamp[];
}

export interface PassportStats {
  totalSessions: number;
  totalMiles: number;
  favoritePack: string | null;
}
