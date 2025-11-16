import { Deck, Item } from './schema.js';

export function parseCSV(text: string, name = 'Uploaded CSV'): Deck {
  const rows = text.trim().split(/\r?\n/);
  const [header, ...rest] = rows;
  const columns = header.split(',').map((c) => c.trim());
  const items: Item[] = rest
    .filter(Boolean)
    .map((line, index) => {
      const cells = line.split(',');
      const record: Record<string, string> = {};
      columns.forEach((col, idx) => {
        record[col] = cells[idx]?.trim() ?? '';
      });
      const tags = record.tag ? record.tag.split(/;|\|/).map((t) => t.trim()).filter(Boolean) : [];
      const type = (record.type as Item['type']) || 'fact';
      return {
        id: `${Date.now()}-${index}`,
        type,
        front: record.front ?? '',
        back: record.back,
        tags,
      };
    });
  return { id: `deck-${Date.now()}`, name, tags: [], items };
}

export function parseJSON(text: string): Deck[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) {
    return data.map((deck, index) => normalizeDeck(deck, `JSON Deck ${index + 1}`));
  }
  return [normalizeDeck(data, data.name ?? 'JSON Deck')];
}

function normalizeDeck(source: any, fallbackName: string): Deck {
  const items: Item[] = (source.items ?? []).map((item: any, index: number) => ({
    id: item.id ?? `${fallbackName}-${index}`,
    type: (item.type as Item['type']) ?? 'fact',
    front: item.front ?? '',
    back: item.back,
    tags: item.tags ?? [],
  }));
  return {
    id: source.id ?? `deck-${crypto.randomUUID?.() ?? Date.now()}`,
    name: source.name ?? fallbackName,
    tags: source.tags ?? [],
    items,
    sourceMeta: source.sourceMeta ?? {},
  };
}

export async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
