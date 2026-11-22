import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval';

/**
 * Local storage in IndexedDB. Nothing leaves the device: no server, no tracking.
 * Keys: 'aksjon', 'statistikk', 'osm', 'hoyde'.
 */
let store: UseStore | null = null;
const db = () => (store ??= createStore('sokskart', 'data'));

export async function lagre<T>(key: string, value: T): Promise<boolean> {
  try {
    await set(key, value, db());
    return true;
  } catch {
    return false;
  }
}

export async function hent<T>(key: string): Promise<T | undefined> {
  try {
    return (await get(key, db())) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function slett(key: string): Promise<void> {
  try {
    await del(key, db());
  } catch {
    /* ignore */
  }
}

/** Removes everything stored by the app on this device (aksjon, cache, statistics). */
export async function slettAlt(): Promise<void> {
  try {
    await clear(db());
  } catch {
    /* ignore */
  }
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}
