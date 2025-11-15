// src/passport/storage.ts
import { PassportStamp, PassportStore } from "./types";

const PASSPORT_STORAGE_KEY = "rtw_passport_v1";

export function loadPassportStore(): PassportStore {
  const raw = window.localStorage.getItem(PASSPORT_STORAGE_KEY);
  if (!raw) {
    return { version: 1, stamps: [] };
  }

  try {
    const parsed = JSON.parse(raw) as PassportStore;

    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.stamps)) {
      return { version: 1, stamps: [] };
    }

    return {
      version: 1,
      stamps: parsed.stamps ?? [],
    };
  } catch {
    return { version: 1, stamps: [] };
  }
}

export function savePassportStore(store: PassportStore): void {
  const normalized: PassportStore = {
    version: 1,
    stamps: store.stamps ?? [],
  };

  window.localStorage.setItem(
    PASSPORT_STORAGE_KEY,
    JSON.stringify(normalized)
  );
}

export function appendStamp(stamp: PassportStamp): PassportStore {
  const store = loadPassportStore();
  store.stamps.push(stamp);
  savePassportStore(store);
  return store;
}
