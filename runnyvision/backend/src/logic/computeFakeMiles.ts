export function computeFakeMiles(runId: string, steps: number): number {
  const combined = `${runId}:${steps}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i += 1) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }

  const normalized = Math.abs(hash % 1000) / 1000;
  const factor = 0.4 + normalized * 1.2;
  const base = steps * 0.5;
  const miles = Math.round(base * factor);
  return miles;
}

