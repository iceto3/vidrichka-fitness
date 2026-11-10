/**
 * 1.4.3 round 2: local food search by words, not by one exact substring. „пилешки гърди“
 * used to find nothing built in (the table says „Пилешко филе“), so only the user's own
 * products and Open Food Facts showed. Pure, unit tested.
 *
 * Matching: lower case (Bulgarian rules), punctuation ignored, every typed word has to match a
 * word of the name (Bulgarian or English). Words match by a light stem (common Bulgarian
 * endings dropped: пилешки / пилешко / пилешките → пилеш) or as the start of a word while
 * typing (пил → пилешко). A few cuts have two everyday names (гърди = breast, i.e. „Пилешко филе“; бут = бедро).
 * Built-in foods always come first, then the user's own; within each, names that start with
 * the first typed word and names that contain the whole query first, otherwise the table order.
 * @module features/food/search
 */

/** Bulgarian endings dropped by the stem, longest first. */
const ENDINGS = [
  'ите',
  'ата',
  'ото',
  'ета',
  'ове',
  'еве',
  'та',
  'то',
  'те',
  'ът',
  'ят',
  'ки',
  'ко',
  'ка',
  'ци',
  'ца',
  'це',
  'и',
  'а',
  'о',
  'е',
  'у',
  'я',
  'ю',
];

/**
 * Same cut, different everyday word (stems). Matched against both names, so „гърди“ finds the
 * foods whose English name says "breast" (chicken, turkey – „Пилешко филе“), not every „филе“.
 */
const SAME = [
  ['гърд', 'breast'],
  ['бут', 'бедр', 'thigh'],
];

/** Lower case, letters and digits only, single spaces. @param {string} s */
export const norm = (s) =>
  String(s ?? '')
    .toLocaleLowerCase('bg')
    .replace(/ѐ/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Light stem of one normalized word. @param {string} w */
export function stem(w) {
  if (/^[a-z]/.test(w)) return w.length > 3 ? w.replace(/(es|s)$/, '') : w;
  for (const e of ENDINGS) if (w.length - e.length >= 3 && w.endsWith(e)) return w.slice(0, -e.length);
  return w;
}

/** Words of a name with their stems. @param {string} s */
const words = (s) =>
  norm(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => ({ w, s: stem(w) }));

/** @param {{w: string, s: string}} q @param {{w: string, s: string}} n */
function wordMatch(q, n) {
  if (n.w.startsWith(q.w) || (q.s.length >= 3 && n.s.startsWith(q.s))) return true;
  if (q.s.length < 3) return false;
  const g = SAME.find((x) => x.some((y) => q.s.startsWith(y) || (q.s.length >= 3 && y.startsWith(q.s))));
  return !!g && g.some((y) => n.s.startsWith(y));
}

/**
 * How well a name matches a query: null = no match, else lower is better.
 * @param {string} name Both names, e.g. "Chicken breast (grilled) Пилешко филе (на скара)".
 * @param {string} q
 */
export function matchScore(name, q) {
  const qs = words(q),
    ns = words(name);
  if (!qs.length) return null;
  if (!qs.every((x) => ns.some((n) => wordMatch(x, n)))) return null;
  let score = 2;
  if (norm(name).includes(norm(q))) score -= 1;
  if (ns.length && wordMatch(qs[0], ns[0])) score -= 1;
  return score;
}

/**
 * Search built-in foods and the user's own: built-in first, then by match quality, then the
 * table order. @template T @param {T[]} builtIn @param {T[]} own @param {string} q
 * @param {(f: T) => string} nameOf @param {number} [max]
 * @returns {T[]}
 */
export function searchFoods(builtIn, own, q, nameOf, max = 30) {
  if (!norm(q)) return [];
  /** @type {{f: T, k: number[]}[]} */
  const hits = [];
  [builtIn, own].forEach((list, src) =>
    list.forEach((f, i) => {
      const sc = matchScore(nameOf(f), q);
      if (sc != null) hits.push({ f, k: [src, sc, i] });
    }),
  );
  return hits
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .slice(0, max)
    .map((h) => h.f);
}
