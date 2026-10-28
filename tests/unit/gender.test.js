/**
 * 1.2: grammatical gender. Bulgarian strings with gendered forms are `{ f, m }` variants,
 * resolved by `t()` / `L()` from the user's setting (default female). English stays neutral.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../../src/data/i18n/en.js';
import bg from '../../src/data/i18n/bg.js';
import { TECHNIQUE } from '../../src/data/technique.js';
import { DEFAULTS } from '../../src/core/settings.js';
import { t, L, setLang, setGender, getGender, isGendered, byGender } from '../../src/core/i18n.js';

/** Gendered keys found in the 1.2 audit of bg.js (the user is addressed with a participle/adjective). */
const GENDERED = [
  'cel.waterSub',
  'cel.levelSub',
  'daily.loudSub',
  // 1.2.1 photos
  'photo.dateHint',
  'cel.photo2',
  'cel.photoSetSub',
  // 1.3 voice
  'whatsNew.voice',
  // 1.3.4 steps, insights, what's new
  'cel.stepsSub',
  'insight.sleepEnergyUp',
  'insight.sleepEnergyDown',
  'insight.workoutMoodUp',
  'insight.stepsWaterUp',
  'whatsNew.homeMeals',
  // 1.4.0: the dictation hints became neutral („какво изяде и изпи“); the otter's tap lines
  'home.otter3',
  'home.otter5',
];

/** Every string variant of a dictionary value. @param {any} v @returns {string[]} */
const variants = (v) => (typeof v === 'string' ? [v] : Object.values(v).flatMap(variants));

test('every gendered BG key has a non-empty female and male form, and they differ', () => {
  const keys = Object.keys(bg).filter((k) => isGendered(bg[k]));
  assert.deepEqual(keys.sort(), [...GENDERED].sort(), 'audited gendered keys');
  for (const k of keys) {
    const v = bg[k];
    assert.deepEqual(Object.keys(v).sort(), ['f', 'm'], k);
    for (const g of ['f', 'm'])
      assert.ok(
        variants(v[g]).every((s) => s.trim().length > 0),
        `${k}.${g}`,
      );
    assert.notEqual(JSON.stringify(v.f), JSON.stringify(v.m), `${k}: forms differ`);
  }
});

test('English stays gender-neutral (no gender variants)', () => {
  assert.deepEqual(
    Object.keys(en).filter((k) => isGendered(en[k])),
    [],
  );
});

test('no user-addressed feminine form is left as a plain BG string', () => {
  // Forms that address the user (not Vidrichka, who is always feminine).
  const FEMININE = [
    /си докоснала/,
    /\bХидратирана\b/,
    /Вие двете/,
    /\b(си|съм) (била|готова|направила|сигурна|уморена)\b/,
  ];
  for (const [k, v] of Object.entries(bg)) {
    if (isGendered(v)) continue;
    for (const s of variants(v)) for (const re of FEMININE) assert.doesNotMatch(s, re, k);
  }
});

test('t() picks the form for the current gender; female is the default', async () => {
  await setLang('bg');
  setGender(undefined);
  assert.equal(getGender(), 'f');
  assert.equal(DEFAULTS.gender, 'f', 'settings default (missing → female, no migration)');
  assert.equal(t('daily.loudSub'), 'Само ако не си докоснала първото');
  assert.equal(t('cel.waterSub', { n: 3, goal: 8 }), 'Хидратирана и щастлива · 3 от 8 чаши');
  setGender('m');
  assert.equal(t('daily.loudSub'), 'Само ако не си докоснал първото');
  assert.equal(t('cel.waterSub', { n: 3, goal: 8 }), 'Хидратиран и щастлив · 3 от 8 чаши');
  assert.equal(t('cel.levelSub'), 'Вие двамата сте неудържими!');
  assert.equal(t('home.weeks', { n: 2 }), '2 седмици', 'plurals still work');
  setGender('x');
  assert.equal(getGender(), 'f', 'unknown → female');
  await setLang('en');
  setGender('m');
  assert.equal(t('daily.loudSub'), en['daily.loudSub'], 'English is unchanged');
  setGender('f');
});

test('a gender variant can wrap plurals, and missing male forms fall back to female', () => {
  const v = { f: { one: 'a', other: 'b' } };
  assert.deepEqual(byGender(v, 'm'), { one: 'a', other: 'b' });
  assert.equal(byGender('plain', 'm'), 'plain');
});

test('L() resolves gendered data texts (1.4.1 technique: "изправена/изправен")', async () => {
  const texts = Object.values(TECHNIQUE)
    .flatMap((x) => [
      ...x.setup,
      ...x.steps,
      ...x.breathing,
      ...x.keyPoints,
      ...x.mistakes.flatMap((m) => [m.mistake, m.fix]),
    ])
    .filter(isGendered);
  assert.ok(texts.length >= 2);
  for (const s of texts) assert.ok(s.f && s.m && s.f !== s.m && !/\//.test(s.f + s.m), JSON.stringify(s));
  const stand = /** @type {any} */ (TECHNIQUE.bodyweight_squat.setup.find(isGendered));
  await setLang('bg');
  setGender('f');
  assert.match(L(stand), /изправена/);
  setGender('m');
  assert.match(L(stand), /изправен(?![а-я])/);
  assert.doesNotMatch(L(stand), /изправена/);
  setGender('f');
  await setLang('en');
});
