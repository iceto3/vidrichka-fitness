/**
 * Storage on Cloudflare D1 (schema: ../migrations). Every function is a single query (or
 * one D1 batch), so a cron run stays far below the per-invocation query limit.
 * `memoryStore()` implements the same interface for unit tests.
 * @module store
 */

/**
 * @typedef {object} Device
 * @property {string} id @property {string} endpoint @property {string} p256dh @property {string} auth
 * @property {string} tz @property {import('./schedule.js').Settings} settings
 * @property {Record<string, any>} texts @property {number} created_at @property {number} updated_at
 * @typedef {{device_id: string, day: string} & import('./schedule.js').DayFlags} DailyRow
 * @typedef {{device_id: string, day: string, kind: string}} SentRow
 * @typedef {object} Store
 * @property {(id: string) => Promise<Device|null>} getDevice
 * @property {() => Promise<number>} countDevices
 * @property {(d: Device) => Promise<void>} upsertDevice
 * @property {(id: string, patch: {tz?: string, settings?: any, texts?: any}, now: number) => Promise<boolean>} updateDevice
 * @property {(ids: string[]) => Promise<void>} deleteDevices
 * @property {() => Promise<Device[]>} listDevices
 * @property {(days: string[]) => Promise<{daily: DailyRow[], sent: SentRow[]}>} stateFor
 * @property {(id: string, day: string, field: string, at: number) => Promise<void>} setFlag
 * @property {(rows: (SentRow & {at: number})[]) => Promise<SentRow[]>} claim Returns the rows newly claimed.
 * @property {(beforeDay: string) => Promise<void>} cleanup
 * @property {(f: import('./collect.js').SharedFood) => Promise<void>} addFood 1.3.4: counts identical entries
 * @property {() => Promise<number>} countFoods Distinct shared foods.
 * @property {(f: import('./collect.js').Feedback, now: number) => Promise<number>} addFeedback Returns the new id.
 * @property {(since: number) => Promise<number>} countFeedback Messages since a time (epoch ms).
 */

const FOOD_COLS = ['name', 'lang', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt'];
/** `col IS ?` matches NULL = NULL too (identical entries are counted, not repeated). */
const SAME_FOOD = FOOD_COLS.map((c, i) => `${c} IS ?${i + 1}`).join(' AND ');

/** Daily flag columns an event may set. */
export const FLAGS = ['ack_at', 'protein_done', 'checkin_am', 'checkin_pm', 'goodnight'];

/** @param {any} r @returns {Device} */
const row2dev = (r) => ({ ...r, settings: JSON.parse(r.settings), texts: JSON.parse(r.texts || '{}') });

/** @param {D1Database} db @returns {Store} */
export function d1Store(db) {
  return {
    async getDevice(id) {
      const r = await db.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first();
      return r ? row2dev(r) : null;
    },
    async countDevices() {
      return /** @type {number} */ ((await db.prepare('SELECT COUNT(*) AS n FROM devices').first('n')) ?? 0);
    },
    async upsertDevice(d) {
      await db
        .prepare(
          `INSERT INTO devices (id, endpoint, p256dh, auth, tz, settings, texts, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
           ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, tz = ?5, settings = ?6, texts = ?7, updated_at = ?8`,
        )
        .bind(
          d.id,
          d.endpoint,
          d.p256dh,
          d.auth,
          d.tz,
          JSON.stringify(d.settings),
          JSON.stringify(d.texts),
          d.updated_at,
        )
        .run();
    },
    async updateDevice(id, p, now) {
      const r = await db
        .prepare(
          `UPDATE devices SET tz = COALESCE(?2, tz), settings = COALESCE(?3, settings), texts = COALESCE(?4, texts), updated_at = ?5 WHERE id = ?1`,
        )
        .bind(
          id,
          p.tz ?? null,
          p.settings ? JSON.stringify(p.settings) : null,
          p.texts ? JSON.stringify(p.texts) : null,
          now,
        )
        .run();
      return r.meta.changes > 0;
    },
    async deleteDevices(ids) {
      if (!ids.length) return;
      const q = ids.map(() => '?').join(',');
      await db.batch([
        db.prepare(`DELETE FROM devices WHERE id IN (${q})`).bind(...ids),
        db.prepare(`DELETE FROM daily WHERE device_id IN (${q})`).bind(...ids),
        db.prepare(`DELETE FROM sent WHERE device_id IN (${q})`).bind(...ids),
      ]);
    },
    async listDevices() {
      return (await db.prepare('SELECT * FROM devices').all()).results.map(row2dev);
    },
    async stateFor(days) {
      const q = days.map(() => '?').join(',');
      const [a, b] = await db.batch([
        db.prepare(`SELECT * FROM daily WHERE day IN (${q})`).bind(...days),
        db.prepare(`SELECT device_id, day, kind FROM sent WHERE day IN (${q})`).bind(...days),
      ]);
      return { daily: /** @type {any} */ (a.results), sent: /** @type {any} */ (b.results) };
    },
    async setFlag(id, day, field, at) {
      if (!FLAGS.includes(field)) throw new Error(`bad flag ${field}`);
      // The first time wins: a late, re-sent (queued) event never moves a flag.
      await db
        .prepare(
          `INSERT INTO daily (device_id, day, ${field}) VALUES (?1, ?2, ?3)
           ON CONFLICT(device_id, day) DO UPDATE SET ${field} = COALESCE(${field}, ?3)`,
        )
        .bind(id, day, at)
        .run();
    },
    async claim(rows) {
      if (!rows.length) return [];
      const vals = rows.map(() => '(?, ?, ?, ?)').join(',');
      const r = await db
        .prepare(`INSERT OR IGNORE INTO sent (device_id, day, kind, at) VALUES ${vals} RETURNING device_id, day, kind`)
        .bind(...rows.flatMap((x) => [x.device_id, x.day, x.kind, x.at]))
        .all();
      return /** @type {any} */ (r.results);
    },
    async cleanup(beforeDay) {
      await db.batch([
        db.prepare('DELETE FROM daily WHERE day < ?').bind(beforeDay),
        db.prepare('DELETE FROM sent WHERE day < ?').bind(beforeDay),
      ]);
    },
    async addFood(f) {
      const vals = FOOD_COLS.map((c) => /** @type {any} */ (f)[c]);
      const r = await db
        .prepare(`UPDATE foods_shared SET n = n + 1 WHERE ${SAME_FOOD}`)
        .bind(...vals)
        .run();
      if (r.meta?.changes) return;
      await db
        .prepare(
          `INSERT INTO foods_shared (${FOOD_COLS.join(', ')}) VALUES (${FOOD_COLS.map((_, i) => `?${i + 1}`).join(', ')})`,
        )
        .bind(...vals)
        .run();
    },
    async countFoods() {
      return /** @type {number} */ ((await db.prepare('SELECT COUNT(*) AS n FROM foods_shared').first('n')) ?? 0);
    },
    async addFeedback(f, now) {
      const id = /** @type {number} */ (
        await db
          .prepare('INSERT INTO feedback (text, version, lang, created_at) VALUES (?, ?, ?, ?) RETURNING id')
          .bind(f.text, f.version, f.lang, now)
          .first('id')
      );
      if (f.images.length)
        await db.batch(
          f.images.map((im, i) =>
            db
              .prepare('INSERT INTO feedback_images (feedback_id, idx, mime, data) VALUES (?, ?, ?, ?)')
              .bind(id, i, im.mime, im.data.buffer.slice(im.data.byteOffset, im.data.byteOffset + im.data.byteLength)),
          ),
        );
      return id;
    },
    async countFeedback(since) {
      return /** @type {number} */ (
        (await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?').bind(since).first('n')) ?? 0
      );
    },
  };
}

/** In-memory Store for tests. @returns {Store & {devices: Map<string, Device>, daily: Map<string, DailyRow>, sent: Map<string, SentRow>, foods: any[], feedback: any[]}} */
export function memoryStore() {
  /** @type {Map<string, Device>} */
  const devices = new Map();
  /** @type {Map<string, DailyRow>} */
  const daily = new Map();
  /** @type {Map<string, SentRow & {at: number}>} */
  const sent = new Map();
  const clone = (/** @type {any} */ x) => structuredClone(x);
  /** @type {any[]} */
  const foods = [];
  /** @type {any[]} */
  const feedback = [];
  return {
    devices,
    daily,
    sent,
    foods,
    feedback,
    async addFood(f) {
      const same = foods.find((x) => FOOD_COLS.every((c) => x[c] === /** @type {any} */ (f)[c]));
      if (same) same.n++;
      else foods.push({ id: foods.length + 1, ...clone(f), n: 1 });
    },
    countFoods: async () => foods.length,
    async addFeedback(f, now) {
      const id = feedback.length + 1;
      feedback.push({ id, ...clone(f), created_at: now });
      return id;
    },
    countFeedback: async (since) => feedback.filter((x) => x.created_at >= since).length,
    getDevice: async (id) => clone(devices.get(id) ?? null),
    countDevices: async () => devices.size,
    upsertDevice: async (d) =>
      void devices.set(d.id, { ...clone(d), created_at: devices.get(d.id)?.created_at ?? d.created_at }),
    async updateDevice(id, p, now) {
      const d = devices.get(id);
      if (!d) return false;
      devices.set(id, {
        ...d,
        ...Object.fromEntries(Object.entries(clone(p)).filter(([, v]) => v != null)),
        updated_at: now,
      });
      return true;
    },
    async deleteDevices(ids) {
      for (const id of ids) {
        devices.delete(id);
        for (const m of [daily, sent]) for (const [k, v] of m) if (v.device_id === id) m.delete(k);
      }
    },
    listDevices: async () => clone([...devices.values()]),
    stateFor: async (days) => ({
      daily: clone([...daily.values()].filter((r) => days.includes(r.day))),
      sent: clone([...sent.values()].filter((r) => days.includes(r.day))),
    }),
    async setFlag(id, day, field, at) {
      if (!FLAGS.includes(field)) throw new Error(`bad flag ${field}`);
      const k = `${id}|${day}`,
        r = daily.get(k) ?? { device_id: id, day };
      daily.set(k, { ...r, [field]: r[field] ?? at });
    },
    async claim(rows) {
      const out = [];
      for (const r of rows) {
        const k = `${r.device_id}|${r.day}|${r.kind}`;
        if (sent.has(k)) continue;
        sent.set(k, { ...r });
        out.push({ device_id: r.device_id, day: r.day, kind: r.kind });
      }
      return out;
    },
    async cleanup(beforeDay) {
      for (const m of [daily, sent]) for (const [k, v] of m) if (v.day < beforeDay) m.delete(k);
    },
  };
}
