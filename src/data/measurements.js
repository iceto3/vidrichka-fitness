/**
 * Body measurement fields. Add a field by appending a row; the form, tiles, charts and
 * backups pick it up automatically. `pair` groups left/right fields into one tile.
 * `hint` is the short "how to measure" text shown in the form.
 */

/** @typedef {{id: string, unit: 'kg'|'cm'|'%', pair?: string, hint: {en: string, bg: string}}} MeasureField */

/** @type {MeasureField[]} */
export const MEASURE_FIELDS = [
  {
    id: 'weight',
    unit: 'kg',
    hint: { en: 'Morning, after the toilet, before eating.', bg: 'Сутрин, след тоалетна и преди хранене.' },
  },
  {
    id: 'waist',
    unit: 'cm',
    hint: { en: 'Narrowest point above the belly button, relaxed.', bg: 'Най-тясната част над пъпа, отпуснато.' },
  },
  {
    id: 'belly',
    unit: 'cm',
    hint: { en: 'Around the belly button, breathe out normally.', bg: 'През пъпа, след нормално издишване.' },
  },
  {
    id: 'hips',
    unit: 'cm',
    hint: { en: 'Widest part of the glutes, feet together.', bg: 'Най-широката част на седалището, стъпала заедно.' },
  },
  {
    id: 'thighL',
    unit: 'cm',
    pair: 'thigh',
    hint: {
      en: 'Widest part of the left thigh, just below the glute.',
      bg: 'Най-широката част на лявото бедро, под седалището.',
    },
  },
  {
    id: 'thighR',
    unit: 'cm',
    pair: 'thigh',
    hint: { en: 'Same spot on the right thigh.', bg: 'Същото място на дясното бедро.' },
  },
  {
    id: 'chest',
    unit: 'cm',
    hint: {
      en: 'Fullest part of the chest, tape level.',
      bg: 'Най-широката част на гърдите, сантиметърът хоризонтално.',
    },
  },
  {
    id: 'underbust',
    unit: 'cm',
    hint: { en: 'Directly under the chest, snug tape.', bg: 'Точно под гърдите, сантиметърът прилепнал.' },
  },
  {
    id: 'armL',
    unit: 'cm',
    pair: 'arm',
    hint: { en: 'Mid upper arm, left, arm relaxed.', bg: 'Средата на лявата мишница, отпусната ръка.' },
  },
  {
    id: 'armR',
    unit: 'cm',
    pair: 'arm',
    hint: { en: 'Same spot on the right arm.', bg: 'Същото място на дясната ръка.' },
  },
  {
    id: 'calves',
    unit: 'cm',
    hint: { en: 'Widest part of the calf while standing.', bg: 'Най-широката част на прасеца, в изправено положение.' },
  },
  {
    id: 'bodyfat',
    unit: '%',
    hint: {
      en: 'From a smart scale or caliper – same method each time.',
      bg: 'От смарт кантар или калипер – всеки път по един и същ начин.',
    },
  },
];

/** Plausible range per unit: values outside are rejected with an inline error. */
export const MEASURE_RANGES = /** @type {const} */ ({ kg: [20, 300], cm: [10, 250], '%': [1, 75] });

/**
 * Check one typed measurement. '' is fine (all fields are optional).
 * @param {MeasureField} f @param {string} raw
 * @returns {{value?: number, error?: string, range?: readonly [number, number]}}
 */
export function checkMeasure(f, raw) {
  const x = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (x === '') return {};
  const range = MEASURE_RANGES[f.unit];
  if (!/^-?\d*\.?\d+$/.test(x)) return { error: 'body.errNumber', range };
  const n = Number(x);
  if (n < range[0] || n > range[1]) return { error: 'body.errRange', range };
  return { value: n };
}
