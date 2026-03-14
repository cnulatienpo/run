/**
 * ============================================================
 *  CSV / JSON INGESTION – PROJECT MAP
 * ------------------------------------------------------------
 *  Role:
 *    - Converts uploaded CSV or JSON files into Deck objects
 *      for use in mnemonic generation, preview, and planning.
 *
 *  Functions:
 *
 *    parseCSV(text, name)
 *      - Splits text into rows using \n
 *      - First row is treated as column headers
 *      - Remaining rows are mapped field-by-field
 *      - Tag fields accept semicolon (;) or pipe (|) separated lists
 *      - Returns a single Deck with:
 *          { id, name, tags:[], items:[{id, type, front, back, tags}] }
 *
 *    parseJSON(text)
 *      - Accepts either:
 *           * a single deck object
 *           * an array of deck objects
 *      - Normalizes each deck via normalizeDeck()
 *      - Returns an array of fully normalized Deck objects
 *
 *    readFile(file)
 *      - Uses FileReader to read CSV/JSON into string form
 *
 *  Deck Model:
 *    {
 *      id: string
 *      name: string
 *      tags: string[]
 *      items: Array<{
 *        id: string
 *        type: "fact" | ...
 *        front: string
 *        back: string
 *        tags: string[]
 *      }>
 *    }
 *
 *  Notes:
 *    - These parsers are used by rv-app “Prep Studio”
 *      when users upload CSV/JSON deck files.
 *    - Parsed decks are persisted via storage.ts.
 * ============================================================
 */
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
