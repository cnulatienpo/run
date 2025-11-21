export interface RunSession {
  id: string;
  userId: string;
  steps: number;
  places: string[];
  fakeMiles: number;
  createdAt: string;
}

export interface RouteConfig {
  id: string;
  name: string;
  videoUrl: string;
  places: string[];
  createdAt: string;
}
