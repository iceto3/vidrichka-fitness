/**
 * 1.4.4 Most used foods and favorites (pure, unit tested; stored on the device only).
 *
 * Points: every add gives a food 1 point, from day one (no 30-day window). After
 * {@link IDLE_DAYS} days without adding it, its points halve, and again every further
 * {@link HALF_LIFE_DAYS} days (decay is computed when read; nothing runs in the background).
 * Adding it again keeps what is left and counts on from there. Ties: the most recently added
 * first. Entries from before 1.4.4 (`{n, ts, cat}`) start with `n` points.
 *
 * Favorites are manual only (the ☆ on a food); they never come from points.
 * @module features/food/usage
 */

const DAY = 86_400_000;
/** Days without adding before the points start to halve. */
export const IDLE_DAYS = 14;
/** Days between two halvings. */
export const HALF_LIFE_DAYS = 14;
/** How many foods the "most used" group shows. */
export const MOST_USED = 5;

/** @typedef {{n?: number, pts?: number, ts: number, cat?: string}} UseEntry */

/**
 * Points of a food now, after decay. @param {UseEntry|undefined} e @param {number} now
 * @returns {number}
 */
export function points(e, now) {
  if (!e) return 0;
  const base = Number(e.pts ?? e.n ?? 0) || 0;
  const idle = now - (Number(e.ts) || 0);
  if (!(idle >= IDLE_DAYS * DAY)) return base;
  const halvings = 1 + Math.floor((idle - IDLE_DAYS * DAY) / (HALF_LIFE_DAYS * DAY));
  return base / 2 ** halvings;
}

/**
 * The entry after one more add: decayed points + 1, now as the last add.
 * @param {UseEntry|undefined} e @param {number} now @param {string} [cat]
 * @returns {UseEntry}
 */
export const bump = (e, now, cat) => ({
  ...(e ?? {}),
  n: (Number(e?.n) || 0) + 1,
  pts: points(e, now) + 1,
  ts: now,
  ...(cat ? { cat } : {}),
});

/**
 * Ids by points (highest first), ties → most recently added. Only foods with points.
 * @param {Record<string, UseEntry>} use @param {number} now @param {(id: string) => boolean} [keep]
 * @returns {string[]}
 */
export function byPoints(use, now, keep = () => true) {
  return Object.entries(use ?? {})
    .map(([id, e]) => ({ id, p: points(e, now), ts: Number(e?.ts) || 0 }))
    .filter((x) => x.p > 0 && keep(x.id))
    .sort((a, b) => b.p - a.p || b.ts - a.ts)
    .map((x) => x.id);
}

/**
 * A food list in three groups: favorites (in the list's order), the most used of the rest
 * (top {@link MOST_USED} by points) and all others (in the list's order). Empty groups are
 * dropped, so the views draw a faint divider only between groups that exist.
 * @template {{id: string}} F
 * @param {F[]} list @param {Record<string, any>} favs @param {Record<string, UseEntry>} use
 * @param {number} now @param {number} [top]
 * @returns {{fav: F[], most: F[], rest: F[]}}
 */
export function groupFoods(list, favs, use, now, top = MOST_USED) {
  const isFav = (/** @type {string} */ id) => !!favs?.[id];
  const fav = list.filter((f) => isFav(f.id));
  const ids = new Set(list.filter((f) => !isFav(f.id)).map((f) => f.id));
  const mostIds = byPoints(use, now, (id) => ids.has(id)).slice(0, top);
  const most = mostIds.map((id) => /** @type {F} */ (list.find((f) => f.id === id)));
  const taken = new Set(mostIds);
  const rest = list.filter((f) => !isFav(f.id) && !taken.has(f.id));
  return { fav, most, rest };
}

/**
 * Categories by their foods' points (highest first, ties keep the default order).
 * @template {{id: string}} C
 * @param {C[]} cats @param {Record<string, UseEntry>} use @param {number} now
 * @returns {C[]}
 */
export function categoriesByPoints(cats, use, now) {
  /** @type {Record<string, number>} */
  const n = {};
  for (const e of Object.values(use ?? {})) if (e?.cat) n[e.cat] = (n[e.cat] ?? 0) + points(e, now);
  return [...cats].sort((a, b) => (n[b.id] ?? 0) - (n[a.id] ?? 0));
}
