/**
 * 1.4.2 POST /vision?kind=label — read a food's nutrition label (the "Хранителна стойност"
 * table on a pack) for the app's new-food form: per-100 g energy, protein, fat, carbs,
 * fibre, salt and, if visible, the product name. Same pipeline as the screenshots
 * (Workers AI first, xAI fallback, the image is never stored or logged); everything the
 * model says is re-checked here, and the app checks it again before pre-filling.
 * @module label
 */

/** Longest product name passed on. */
export const MAX_LABEL_NAME = 80;

export function labelPrompt() {
  return [
    'This is a photo of a food package nutrition label (it may be in Bulgarian, e.g. "Хранителна стойност", "Енергийна стойност", "Мазнини", "Въглехидрати", "Белтъчини", "Фибри", "Сол", or in English).',
    'Read the values PER 100 g (or per 100 ml). If the label only gives values per serving, read those and give the serving size in grams.',
    'Answer with JSON only:',
    '{"name": product name if clearly printed else null, "basis": "100g" | "100ml" | "serving", "serving_g": number or null,',
    ' "energy_kcal": number or null, "energy_kj": number or null, "protein": g or null, "fat": g or null, "carbs": g or null,',
    ' "fiber": g or null, "salt": g or null, "sodium": g or null}',
    'Copy the numbers exactly as printed (use a dot for decimals). "carbs" is total carbohydrate, not "of which sugars"; "fat" is total fat, not saturates.',
    'If no nutrition table is readable, answer {"basis": null}. Never guess numbers.',
  ].join('\n');
}

/** "12,5 g", "<0.5", "1 234" → number, else null. @param {any} v */
export function labelNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v ?? '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/^[<≤~]/, '')
    .replace(',', '.');
  const m = /^(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) : null;
}

/** @param {number|null} v @param {number} max @param {number} [d] decimals */
const inRange = (v, max, d = 1) => (v == null || !(v >= 0) || v > max ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * Re-check a model's label answer and bring it to per-100 g.
 * kJ only → kcal (÷ 4.184); sodium only → salt (× 2.5); per serving with a known serving
 * weight → per 100 g. Values out of range are dropped (null), not clamped.
 * @param {any} out
 * @returns {{name: string|null, kcal: number|null, p: number|null, f: number|null, c: number|null, fib: number|null, salt: number|null, basis: string}|null}
 *   null when nothing usable was read.
 */
export function normalizeLabel(out) {
  if (!out || typeof out !== 'object') return null;
  const basis = ['100g', '100ml', 'serving'].includes(out.basis) ? out.basis : null;
  if (!basis) return null;
  let k = 1;
  if (basis === 'serving') {
    const g = labelNum(out.serving_g);
    if (!g || g <= 0 || g > 2000) return null; // per serving with an unknown weight: can't convert
    k = 100 / g;
  }
  const x = (/** @type {any} */ v) => {
    const n = labelNum(v);
    return n == null ? null : n * k;
  };
  let kcal = x(out.energy_kcal);
  const kj = x(out.energy_kj);
  if (kcal == null && kj != null) kcal = kj / 4.184;
  let salt = x(out.salt);
  const sodium = x(out.sodium);
  if (salt == null && sodium != null) salt = sodium * 2.5;
  const name =
    typeof out.name === 'string' && out.name.trim()
      ? out.name.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_NAME)
      : null;
  const res = {
    name,
    kcal: inRange(kcal, 900, 0),
    p: inRange(x(out.protein), 100),
    f: inRange(x(out.fat), 100),
    c: inRange(x(out.carbs), 100),
    fib: inRange(x(out.fiber), 100),
    salt: inRange(salt, 100, 2),
    basis,
  };
  return res.kcal == null && res.p == null && res.f == null && res.c == null ? null : res;
}
