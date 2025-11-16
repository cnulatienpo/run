import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const fileLocks: Map<string, Promise<void>> = new Map();

function withLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const normalizedPath = path.resolve(filePath);
  const existing = fileLocks.get(normalizedPath) ?? Promise.resolve();
  const nextTask = existing.then(() => task());
  fileLocks.set(
    normalizedPath,
    nextTask.then(
      () => undefined,
      () => undefined
    )
  );
  return nextTask;
}

export async function ensureFile(
  filePath: string,
  defaultValue: unknown
): Promise<void> {
  await withLock(filePath, async () => {
    try {
      await readFile(filePath, "utf-8");
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        throw err;
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        JSON.stringify(defaultValue, null, 2),
        "utf-8"
      );
    }
  });
}

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  return withLock(filePath, async () => {
    const content = await readFile(filePath, "utf-8");
    if (!content) {
      return {} as T;
    }
    return JSON.parse(content) as T;
  });
}

export async function writeJson(
  filePath: string,
  data: unknown
): Promise<void> {
  await withLock(filePath, async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const serialized = JSON.stringify(data, null, 2);
    await writeFile(filePath, serialized, "utf-8");
  });
}
