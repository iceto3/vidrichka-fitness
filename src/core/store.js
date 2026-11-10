/**
 * In-memory, write-through data store on top of IndexedDB.
 * Reads are synchronous from the cache (instant UI); writes update the cache first and
 * persist in the background. Falls back to memory-only mode if IndexedDB is unavailable.
 * @module core/store
 */
import { DB_NAME, STORES, getAll, getMany, write } from './db.js';
import { APP_ID, DATA_VERSION, migrate } from './migrations.js';
import { emit } from './bus.js';

/** @type {Record<string, Map<string, any>>} */
const cache = Object.fromEntries(STORES.map((s) => [s, new Map()]));
let persistent = true;

/**
 * 1.4.3 (tester round 3): other open tabs of the app. Each tab keeps its own in-memory copy,
 * so after a write is safely in IndexedDB the tab tells the others which rows changed and
 * they re-read just those rows (and re-render). A re-read never writes or re-announces, so
 * there is no ping-pong; a row with a local write still on its way is not re-read (that
 * newer write lands last and is announced in turn), so no write is lost or undone.
 * @type {BroadcastChannel|null}
 */
let tabs = null;
/** Local writes per `store id` not yet committed. @type {Map<string, number>} */
const pending = new Map();
const pkey = (/** @type {string} */ store, /** @type {string} */ id) => `${store}\u0000${id}`;

/**
 * Persist one change, then tell the other tabs. @param {string} store @param {string} id
 * @param {(tx: IDBTransaction) => void} fn
 */
function persist(store, id, fn) {
  const k = pkey(store, id);
  pending.set(k, (pending.get(k) ?? 0) + 1);
  write([store], fn)
    .then(() => tabs?.postMessage({ store, ids: [id] }))
    .catch(fail)
    .finally(() => {
      const n = (pending.get(k) ?? 1) - 1;
      if (n > 0) pending.set(k, n);
      else pending.delete(k);
    });
}

/**
 * Start listening to the other tabs (browser only; call after {@link load}).
 * @returns {() => void} Stop.
 */
export function startTabSync() {
  if (!persistent || tabs || typeof BroadcastChannel !== 'function') return () => {};
  const bc = new BroadcastChannel(`${DB_NAME}:sync`);
  tabs = bc;
  bc.onmessage = (e) => {
    const m = e.data;
    if (m?.all) return void reloadAll();
    if (typeof m?.store === 'string' && STORES.includes(m.store) && Array.isArray(m.ids))
      reload(
        m.store,
        m.ids.filter((/** @type {unknown} */ id) => typeof id === 'string' && !pending.has(pkey(m.store, id))),
        true,
      );
  };
  return () => (bc.close(), (tabs = null));
}

/** Another tab replaced everything (restore from a backup, „Изтрий всичко“): re-read it all. */
async function reloadAll() {
  const rows = await Promise.all(STORES.map((s) => getAll(s))).catch(() => null);
  if (!rows) return;
  STORES.forEach((s, i) => {
    cache[s].clear();
    rows[i].forEach((r) => cache[s].set(r.id, r));
  });
  remote = true;
  try {
    emit('store:replaced');
    emit('store:any', '*');
  } finally {
    remote = false;
  }
}

let remote = false;
/**
 * True while the store announces changes another tab made (that tab already ran the side
 * effects, e.g. the protein breakfast bookkeeping, so listeners can skip them).
 */
export const fromOtherTab = () => remote;

/** Report a persistence error once per call site without breaking the UI. @param {unknown} err */
const fail = (err) => {
  console.error('[store] write failed', err);
  emit('store:error', err);
};

/**
 * Load everything into memory and run pending data migrations.
 * @returns {Promise<{persistent: boolean}>}
 */
export async function load() {
  try {
    const rows = await Promise.all(STORES.map((s) => getAll(s)));
    STORES.forEach((s, i) => rows[i].forEach((r) => cache[s].set(r.id, r)));
    const version = kv('meta', { dataVersion: DATA_VERSION }).dataVersion;
    if (version < DATA_VERSION) await replaceAll(migrate({ ...snapshot(), version }));
    else if (!cache.kv.has('meta')) setKv('meta', { dataVersion: DATA_VERSION, createdAt: Date.now() });
    navigator.storage?.persist?.().catch(() => {});
  } catch (err) {
    console.warn('[store] IndexedDB unavailable – memory-only mode', err);
    persistent = false;
  }
  return { persistent };
}

/** All rows of a store. @param {string} store @returns {any[]} */
export const all = (store) => [...cache[store].values()];

/** One row by id. @param {string} store @param {string} id */
export const get = (store, id) => cache[store].get(id);

/**
 * Insert or replace a row (must have an `id`).
 * @template {{id: string}} T
 * @param {string} store
 * @param {T} row
 * @returns {T}
 */
export function put(store, row) {
  cache[store].set(row.id, row);
  if (persistent) persist(store, row.id, (tx) => tx.objectStore(store).put(row));
  emit(`store:${store}`, row);
  emit('store:any', store);
  return row;
}

/**
 * Re-read rows from IndexedDB into the cache — used after the service worker changed them
 * (e.g. "+1 glass" or "Yes, I ate" tapped on a notification while the app was closed).
 * Also used for the changes another open tab made (`other`, see {@link startTabSync}).
 * @param {string} store
 * @param {string[]} ids
 * @param {boolean} [other]
 */
export async function reload(store, ids, other = false) {
  if (!persistent || !ids.length) return;
  const rows = await getMany(store, ids).catch(() => null);
  if (!rows) return;
  let changed = false;
  remote = other;
  try {
    rows.forEach((r, i) => {
      const old = cache[store].get(ids[i]);
      if (JSON.stringify(old) === JSON.stringify(r)) return;
      if (r) cache[store].set(r.id, r);
      else cache[store].delete(ids[i]);
      changed = true;
      emit(`store:${store}`, r ?? { id: ids[i], removed: true });
    });
    if (changed) emit('store:any', store);
  } finally {
    remote = false;
  }
}

/** Delete a row. @param {string} store @param {string} id */
export function remove(store, id) {
  cache[store].delete(id);
  if (persistent) persist(store, id, (tx) => tx.objectStore(store).delete(id));
  emit(`store:${store}`, { id, removed: true });
  emit('store:any', store);
}

/**
 * Read a key/value entry.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export const kv = (key, fallback) => cache.kv.get(key)?.value ?? fallback;

/** Write a key/value entry. @param {string} key @param {any} value */
export const setKv = (key, value) => put('kv', { id: key, value });

/** Random id with a readable prefix. @param {string} [prefix] */
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Current data as a snapshot (blobs kept as Blob objects).
 * @returns {import('./migrations.js').Snapshot}
 */
export function snapshot() {
  const stores = Object.fromEntries(STORES.map((s) => [s, all(s)]));
  return { app: APP_ID, version: DATA_VERSION, exportedAt: new Date().toISOString(), stores };
}

/**
 * Replace ALL data with a (validated, migrated) snapshot in one transaction.
 * @param {import('./migrations.js').Snapshot} snap
 */
export async function replaceAll(snap) {
  const meta = { ...kv('meta', {}), dataVersion: DATA_VERSION };
  STORES.forEach((s) => {
    cache[s].clear();
    (snap.stores[s] ?? []).forEach((r) => r && r.id != null && cache[s].set(r.id, r));
  });
  cache.kv.set('meta', { id: 'meta', value: meta });
  if (persistent)
    await write([...STORES], (tx) =>
      STORES.forEach((s) => {
        const os = tx.objectStore(s);
        os.clear();
        cache[s].forEach((r) => os.put(r));
      }),
    );
  tabs?.postMessage({ all: true });
  emit('store:replaced');
  emit('store:any', '*');
}
