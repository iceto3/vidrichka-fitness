/**
 * 1.2: grammatical gender. Bulgarian strings with gendered forms are `{ f, m }` variants,
 * resolved by `t()` / `L()` from the user's setting (default female). English stays neutral.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../../src/data/i18n/en.js';
import bg from '../../src/data/i18n/bg.js';
import { EXERCISES } from '../../src/data/exercises.js';
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
  'voice.hint',
  'whatsNew.voice',
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

test('L() resolves gendered data texts (exercise steps)', async () => {
  const steps = EXERCISES.flatMap((e) => [...e.steps, ...(e.tips ?? [])]).filter((x) => isGendered(x.bg));
  assert.ok(steps.length >= 2);
  for (const s of steps) assert.ok(s.bg.f && s.bg.m && s.bg.f !== s.bg.m, s.en);
  await setLang('bg');
  const rdl = EXERCISES.flatMap((e) => e.steps).find((x) => x.en === 'Stand tall, soft knees');
  setGender('f');
  assert.equal(L(rdl), 'Изправена, меки колене');
  setGender('m');
  assert.equal(L(rdl), 'Изправен, меки колене');
  await setLang('en');
  assert.equal(L(rdl), 'Stand tall, soft knees');
  setGender('f');
});
