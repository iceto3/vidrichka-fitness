/**
 * 1.6.1 Which body measurements a user sees (pure, unit tested). The profile's gender sets
 * the default set (MEASURE_SETS: common + men's / women's); any measurement can be hidden,
 * shown or added from the other set. Once the user changes the set it is hers/his
 * (`custom`), so a later gender change keeps it. Nothing is ever deleted: hiding only hides
 * the tile and the form field, the saved values stay.
 *
 * Migration: before 1.6.1 there was no choice (kv `measureTiles` missing) – the defaults are
 * shown plus every measurement that already has a value, so no history disappears.
 * @module features/body/fields
 */
import { MEASURE_FIELDS, MEASURE_SETS, checkMeasure } from '../../data/measurements.js';

/** @typedef {{custom?: boolean, shown?: string[]}} TilePref kv `measureTiles` */
/** @typedef {{id: string, fields: string[], unit: string}} Tile */

/** Every tile: single fields or L/R pairs, in catalog order (weight first). @type {Tile[]} */
export const ALL_TILES = MEASURE_FIELDS.reduce((/** @type {Tile[]} */ a, f) => {
  const ex = f.pair && a.find((x) => x.id === f.pair);
  if (ex) ex.fields.push(f.id);
  else a.push({ id: f.pair ?? f.id, fields: [f.id], unit: f.unit });
  return a;
}, []);

const KNOWN = new Set(ALL_TILES.map((x) => x.id));

/** Default tiles for a gender ('m' = men's set, anything else = women's, like the app's grammar). @param {any} gender */
export const defaultTiles = (gender) =>
  /** @type {string[]} */ ([...MEASURE_SETS.common, ...MEASURE_SETS[gender === 'm' ? 'm' : 'f']]);

/** Tiles that already have a saved value. @param {any[]} rows measurements */
export const tilesWithData = (rows) =>
  ALL_TILES.filter((tile) => rows.some((r) => tile.fields.some((f) => r?.[f] != null))).map((x) => x.id);

/**
 * Tiles shown, in catalog order. Weight is always there (its card and the form need it).
 * @param {TilePref|undefined} pref @param {any} gender @param {any[]} rows
 * @returns {string[]}
 */
export function shownTiles(pref, gender, rows) {
  const on = new Set(
    pref?.custom && Array.isArray(pref.shown)
      ? pref.shown.filter((id) => KNOWN.has(id))
      : [...defaultTiles(gender), ...tilesWithData(rows)],
  );
  on.add('weight');
  return ALL_TILES.filter((x) => on.has(x.id)).map((x) => x.id);
}

/**
 * Show or hide one tile; the result is the user's own set (kept on a gender change).
 * @param {TilePref|undefined} pref @param {any} gender @param {any[]} rows @param {string} id @param {boolean} on
 * @returns {TilePref}
 */
export function setTile(pref, gender, rows, id, on) {
  const cur = new Set(shownTiles(pref, gender, rows));
  if (KNOWN.has(id) && id !== 'weight') on ? cur.add(id) : cur.delete(id);
  return { custom: true, shown: ALL_TILES.filter((x) => cur.has(x.id)).map((x) => x.id) };
}

/** Back to the defaults of the current gender (the choice follows gender again). @returns {TilePref} */
export const resetTiles = () => ({ custom: false });

/** Form fields of the shown tiles (catalog order). @param {string[]} tiles */
export const fieldsOf = (tiles) => {
  const on = new Set(tiles);
  return MEASURE_FIELDS.filter((f) => on.has(f.pair ?? f.id));
};

/**
 * Tiles grouped for the „Измервания“ settings sheet: the gender's set first, then the rest.
 * @param {any} gender @returns {{mine: string[], more: string[]}}
 */
export function tileGroups(gender) {
  const mine = defaultTiles(gender);
  return { mine, more: ALL_TILES.map((x) => x.id).filter((id) => !mine.includes(id)) };
}

/** The tile a field belongs to (a pair's L/R fields share one). @param {string} field */
export const tileOf = (field) => ALL_TILES.find((x) => x.fields.includes(field));

/**
 * 1.6.2 One measurement entry from typed values (the quick entry in a tile's sheet and the
 * full form): validated per field; `row` null while something is wrong or nothing typed.
 * @param {string[]} fields @param {Record<string, string>} typed @param {string} date @param {number} now
 * @returns {{row: Record<string, any>|null, bad: Record<string, {error?: string, range?: readonly [number, number]}>}}
 */
export function measureRow(fields, typed, date, now) {
  /** @type {Record<string, any>} */
  const row = { date, ts: now };
  /** @type {Record<string, {error?: string, range?: readonly [number, number]}>} */
  const bad = {};
  for (const id of fields) {
    const f = MEASURE_FIELDS.find((x) => x.id === id);
    if (!f) continue;
    const c = checkMeasure(f, typed[id] ?? '');
    if (c.error) bad[id] = c;
    else if (c.value != null) row[id] = c.value;
  }
  return { row: Object.keys(bad).length || Object.keys(row).length <= 2 ? null : row, bad };
}
