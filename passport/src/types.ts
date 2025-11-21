export interface RunSession {
  id: string;
  userId: string;
  steps: number;
  places: string[];
  fakeMiles: number;
  createdAt: string;
}
