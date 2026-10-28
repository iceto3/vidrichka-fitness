/**
 * Low-level IndexedDB access with a versioned schema.
 * `SCHEMA[i]` upgrades the database from version i to i+1. Only ever APPEND steps —
 * never edit or remove old ones — so existing installs upgrade without losing data.
 * @module core/db
 */

import { DB_NAME } from './channel.js';

export { DB_NAME };

/** All object stores (each keyed by `id`). */
export const STORES = /** @type {const} */ ([
  'kv',
  'plans',
  'sessions',
  'measurements',
  'food',
  'meals',
  'foods',
  'photos',
  'days', // v2 (1.1.0): one row per day – wake/bed times, protein, check-ins
  'trash', // v3 (1.3.1): "Recently deleted" – deleted rows kept 7 days so they can be restored
]);

/** @type {((db: IDBDatabase, tx: IDBTransaction) => void)[]} */
export const SCHEMA = [
  // v0 -> v1 (1.0.0): initial stores. Frozen list – never derive old steps from STORES.
  (db) =>
    ['kv', 'plans', 'sessions', 'measurements', 'food', 'meals', 'foods', 'photos'].forEach((s) =>
      db.createObjectStore(s, { keyPath: 'id' }),
    ),
  // v1 -> v2 (1.1.0): daily rhythm records. Existing stores and rows are untouched.
  (db) => db.objectStoreNames.contains('days') || db.createObjectStore('days', { keyPath: 'id' }),
  // v2 -> v3 (1.3.1): the "Recently deleted" bin. Existing stores and rows are untouched.
  (db) => db.objectStoreNames.contains('trash') || db.createObjectStore('trash', { keyPath: 'id' }),
];

export const DB_VERSION = SCHEMA.length;

/** @type {Promise<IDBDatabase>|null} */
let dbp = null;

/**
 * Promisify an IDBRequest.
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
const done = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

/**
 * Open (and upgrade if needed) the database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  dbp ??= new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const tx = /** @type {IDBTransaction} */ (req.transaction);
      for (let v = e.oldVersion; v < DB_VERSION; v++) SCHEMA[v](req.result, tx);
    };
    req.onsuccess = () => {
      // Let a newer version (another tab, or the service worker) upgrade without blocking.
      req.result.onversionchange = () => (req.result.close(), (dbp = null));
      res(req.result);
    };
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('Database upgrade blocked by another open tab'));
  });
  return dbp;
}

/**
 * Read every record of a store.
 * @param {string} store
 * @returns {Promise<any[]>}
 */
export async function getAll(store) {
  const db = await openDb();
  return done(db.transaction(store).objectStore(store).getAll());
}

/**
 * Read some records by id (missing ones are `undefined`).
 * @param {string} store
 * @param {string[]} ids
 * @returns {Promise<any[]>}
 */
export async function getMany(store, ids) {
  const os = (await openDb()).transaction(store).objectStore(store);
  return Promise.all(ids.map((id) => done(os.get(id))));
}

/**
 * Run writes in one transaction.
 * @param {string[]} stores
 * @param {(tx: IDBTransaction) => void} fn
 * @returns {Promise<void>}
 */
export async function write(stores, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(stores, 'readwrite');
    fn(tx);
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
