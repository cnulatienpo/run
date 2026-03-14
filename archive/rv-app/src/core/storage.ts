import { Deck, Mnemonic, Plan, Profile, SessionLog, RVPrefs, Pack } from './schema.js';

type StoreName = 'profiles' | 'decks' | 'items' | 'mnemonics' | 'plans' | 'sessions' | 'prefs';

const DB_NAME = 'rv-local';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const stores: StoreName[] = ['profiles', 'decks', 'items', 'mnemonics', 'plans', 'sessions', 'prefs'];
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(storeName: StoreName, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    fn(store)
      .then((value) => {
        tx.oncomplete = () => resolve(value);
      })
      .catch(reject);
    tx.onerror = () => reject(tx.error);
  });
}

export async function putProfile(profile: Profile) {
  return withStore('profiles', 'readwrite', (store) => requestAsPromise(store.put(profile)));
}

export async function putDeck(deck: Deck) {
  return withStore('decks', 'readwrite', (store) => requestAsPromise(store.put(deck)));
}

export async function putMnemonic(mnemonic: Mnemonic) {
  return withStore('mnemonics', 'readwrite', (store) => requestAsPromise(store.put(mnemonic)));
}

export async function putPlan(plan: Plan) {
  return withStore('plans', 'readwrite', (store) => requestAsPromise(store.put(plan)));
}

export async function putSession(session: SessionLog) {
  return withStore('sessions', 'readwrite', (store) => requestAsPromise(store.put(session)));
}

export async function putPrefs(prefs: RVPrefs) {
  return withStore('prefs', 'readwrite', (store) => requestAsPromise(store.put(prefs)));
}

export async function listProfiles() {
  return withStore('profiles', 'readonly', (store) => requestAsPromise(store.getAll()));
}

export async function listDecks() {
  return withStore('decks', 'readonly', (store) => requestAsPromise(store.getAll()));
}

export async function listMnemonics() {
  return withStore('mnemonics', 'readonly', (store) => requestAsPromise(store.getAll()));
}

export async function listPlans() {
  return withStore('plans', 'readonly', (store) => requestAsPromise(store.getAll()));
}

export async function listSessions() {
  return withStore('sessions', 'readonly', (store) => requestAsPromise(store.getAll()));
}

export async function getPrefs(): Promise<RVPrefs | null> {
  const prefs = await withStore('prefs', 'readonly', (store) => requestAsPromise(store.get('default')));
  return prefs ?? null;
}

export async function clearAll() {
  const db = await openDB();
  const storeNames = Array.from(db.objectStoreNames);
  await Promise.all(
    storeNames.map(
      (store) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    )
  );
}

const MEDIA_CACHE = 'rv-media';

export async function cacheMedia(request: RequestInfo, response: Response) {
  const cache = await caches.open(MEDIA_CACHE);
  await cache.put(request, response.clone());
}

export async function clearMediaCache() {
  await caches.delete(MEDIA_CACHE);
}

export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return { supported: false, persisted: false };
  const persisted = await navigator.storage.persist();
  return { supported: true, persisted };
}

export async function getUsage() {
  if (!navigator.storage || !navigator.storage.estimate) return { usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

export async function getLockerHandle() {
  if ('getDirectory' in navigator.storage) {
    try {
      return await (navigator.storage as any).getDirectory();
    } catch (err) {
      console.warn('Locker unavailable', err);
    }
  }
  if ('showDirectoryPicker' in window) {
    return await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  }
  return null;
}

async function cryptoKeyFromPassphrase(passphrase: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const saltBuffer = salt.slice().buffer;
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 75000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportPack(passphrase?: string): Promise<Blob> {
  const [profile] = await listProfiles();
  const [decks, mnemonics, sessions] = await Promise.all([listDecks(), listMnemonics(), listSessions()]);
  const pack: Pack = {
    profileId: profile?.id ?? 'none',
    decks,
    mnemonics,
    sessions,
  };
  const json = JSON.stringify(pack);
  const data = new TextEncoder().encode(json);
  if (!passphrase) {
    return new Blob([data], { type: 'application/rvzip+json' });
  }
  const salt = crypto.getRandomValues(new Uint8Array(12));
  const key = await cryptoKeyFromPassphrase(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const payload = new Uint8Array(salt.length + iv.length + cipher.byteLength);
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(new Uint8Array(cipher), salt.length + iv.length);
  return new Blob([payload], { type: 'application/rvzip+aesgcm' });
}

export async function importPack(file: File, passphrase?: string) {
  const buffer = await file.arrayBuffer();
  let data: Uint8Array;
  if (file.type === 'application/rvzip+aesgcm') {
    if (!passphrase) throw new Error('Passphrase required');
    const salt = new Uint8Array(buffer.slice(0, 12));
    const iv = new Uint8Array(buffer.slice(12, 24));
    const key = await cryptoKeyFromPassphrase(passphrase, salt);
    const cipher = buffer.slice(24);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    data = new Uint8Array(plain);
  } else {
    data = new Uint8Array(buffer);
  }
  const json = new TextDecoder().decode(data);
  const pack: Pack = JSON.parse(json);
  if (pack.profileId && pack.decks) {
    await clearAll();
    if (pack.profileId && pack.decks.length) {
      const profile: Profile = {
        id: pack.profileId,
        createdAt: Date.now(),
        mnemonicPrefs: { devices: ['pun', 'metaphor', 'loci'], absurdity: 'medium', complexity: 3 },
        audioPrefs: { mode: 'earcons', talkback: 'off' },
        safety: { sfw: true, motion: 'gentle' },
        cityAnchors: ['paris'],
        defaults: { runMode: '60min' },
      };
      await putProfile(profile);
    }
    await Promise.all(pack.decks.map(putDeck));
    await Promise.all(pack.mnemonics.map(putMnemonic));
    await Promise.all(pack.sessions.map(putSession));
  }
}
