// 1.5.1 parts 3 and 4: saturated fat and sugar, the foods sheet, Начало shows everything
// tracked (mood / energy, water), and a sleep chart bar opens that night's sleep editor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../../src/core/i18n.js';
import { applyFix, fromOff, portion, scaleRow, totals, validateFood } from '../../src/features/food/logic.js';
import { nutrientLine } from '../../src/features/food/nutrients.js';
import { foodTotals } from '../../src/features/day/logic.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

await setLang('bg');

test('3a: saturated fat and sugar scale with the grams like fiber; unknown stays unknown', () => {
  const choc = { kcal: 540, p: 6, c: 58, f: 31, sat: 19, sug: 52, fib: 3 };
  assert.deepEqual(portion(choc, 50), { kcal: 270, p: 3, c: 29, f: 15.5, fib: 1.5, sat: 9.5, sug: 26 });
  const plain = portion({ kcal: 100, p: 1, c: 2, f: 3 }, 200);
  assert.equal('sat' in plain, false, 'a food without them gets no 0');
  assert.equal('sug' in plain, false);
  const row = { id: 'r', grams: 50, ...portion(choc, 50) };
  const r2 = scaleRow(row, 100, choc);
  assert.equal(r2.sat, 19);
  assert.equal(r2.sug, 52);
  const old = { id: 'o', grams: 100, kcal: 100, p: 1, c: 2, f: 3 }; // a row from before 1.5.1
  const o2 = scaleRow(old, 200);
  assert.equal('sat' in o2, false);
  assert.equal('sug' in o2, false);
});

test('3a: totals count only rows that list them; old rows load unchanged', () => {
  const t = totals([
    { kcal: 100, p: 1, c: 10, f: 5, sat: 2, sug: 4 },
    { kcal: 50, p: 1, c: 1, f: 1 }, // old row
  ]);
  assert.equal(t.sat, 2);
  assert.equal(t.sug, 4);
  assert.equal(t.satN, 1);
  assert.equal(t.sugN, 1);
  const none = totals([{ kcal: 50, p: 1, c: 1, f: 1 }]);
  assert.equal(none.satN, 0, 'shown as „—“');
  const day = foodTotals([
    { kcal: 100, p: 1, c: 10, f: 5, sat: 2.04, sug: 0 },
    { kcal: 50, p: 1, c: 1, f: 1 },
  ]);
  assert.equal(day?.sat, 2);
  assert.equal(day?.sug, 0);
  assert.equal(foodTotals([{ kcal: 50, p: 1, c: 1, f: 1 }])?.sat, null, 'nothing lists it: unknown');
});

test('3a: the item row line shows „зх“ / „нм“ only when the food lists them', () => {
  const row = { p: 25, c: 3.14, f: 10.06, fib: 1.2, salt: 0.3 };
  assert.equal(nutrientLine(row), 'пр 25 · вх 3,1 · мз 10,1 · фб 1,2 · сл 0,3', 'old rows: as before');
  assert.equal(
    nutrientLine({ ...row, sat: 4, sug: 0.02 }),
    'пр 25 · вх 3,1 · зх <0,1 · мз 10,1 · нм 4 · фб 1,2 · сл 0,3',
  );
});

test('3a: manual food – optional fields, never more than the fat / the carbs', () => {
  const base = { name: 'x', kcal: '540', p: '6', c: '58', f: '31', fib: '', salt: '', portion: '100' };
  const ok = validateFood({ ...base, sat: '19', sug: '52' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.sat, 19);
  assert.equal(ok.values.sug, 52);
  const empty = validateFood({ ...base, sat: '', sug: '' });
  assert.equal('sat' in empty.values, false, 'empty = unknown');
  assert.equal('sug' in empty.values, false);
  const bad = validateFood({ ...base, sat: '40', sug: '60' });
  assert.equal(bad.errors.sat, 'manual.errSat');
  assert.equal(bad.errors.sug, 'manual.errSug');
  assert.equal(validateFood({ ...base, sat: '-1' }).errors.sat, 'manual.errNegative');
  // the fill-in form for an online product keeps / replaces them
  const fixed = applyFix(
    { id: 'off_1', source: 'off', kcal: 0, p: 0, c: 0, f: 0, sat: 1 },
    { ...base, sat: '', sug: '7' },
  );
  assert.equal('sat' in fixed, false);
  assert.equal(fixed.sug, 7);
});

test('3a: Open Food Facts – saturated-fat_100g / sugars_100g when listed and possible', () => {
  const n = { 'energy-kcal_100g': 540, proteins_100g: 6, carbohydrates_100g: 58, fat_100g: 31 };
  const f = fromOff({ nutriments: { ...n, 'saturated-fat_100g': 18.96, sugars_100g: 51.5 } });
  assert.equal(f?.sat, 19);
  assert.equal(f?.sug, 51.5);
  const none = fromOff({ nutriments: n });
  assert.equal(none && 'sat' in none, false);
  const odd = fromOff({ nutriments: { ...n, 'saturated-fat_100g': 40, sugars_100g: 70 } });
  assert.equal(odd && 'sat' in odd, false, 'more than the fat: dropped, not the whole product');
  assert.equal(odd && 'sug' in odd, false);
});

test('1.5.1: the new i18n keys exist in both languages', () => {
  for (const k of [
    'food.satFat',
    'food.sugar',
    'nutr.sat',
    'nutr.sug',
    'manual.sat',
    'manual.sug',
    'manual.errSat',
    'manual.errSug',
  ]) {
    assert.ok(/** @type {any} */ (bg)[k], `bg ${k}`);
    assert.ok(/** @type {any} */ (en)[k], `en ${k}`);
  }
});

test('3b: herring is a built-in fish with sourced creatine, saturated fat and sugar; the sheet has the columns', async () => {
  const { FOODS } = await import('../../src/data/foods.js');
  const { CREATINE_MG } = await import('../../src/data/creatine.js');
  const h = FOODS.find((f) => f.id === 'herring');
  assert.ok(h);
  assert.equal(h.cat, 'meat');
  assert.deepEqual([h.kcal, h.p, h.c, h.f, h.sat, h.sug], [158, 18, 0, 9, 2, 0]);
  assert.equal(CREATINE_MG.herring, 650);
  assert.equal(FOODS.filter((f) => 'sat' in f).length, 1, 'no invented values: the rest stay unknown');
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync('docs/foods.csv', 'utf8').split('\n');
  assert.equal(
    csv[0],
    'id,category,name_bg,name_en,kcal,protein,carbs,fat,fiber,salt,portion_g,creatine_mg,sat_fat,sugar',
  );
  assert.ok(csv.includes('herring,meat,Херинга (сурова),Herring (raw),158,18,0,9,0,0.23,100,650,2,0'));
  assert.equal(csv.length - 2, FOODS.length, 'every food (regenerated with tools/export-foods.mjs)');
  const salmon = csv.find((l) => l.startsWith('salmon,'));
  assert.ok(salmon?.split(',')[11], 'creatine stays filled for foods that had it');
});

test('4a: Начало – sleep, then mood / energy and water (the day view cards), then meals; the rest stays', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync('src/features/home/views/home.js', 'utf8');
  const pos = (/** @type {string} */ s) => js.indexOf(s);
  const order = [
    '${stepsCard(dayKey())}',
    '${sleepCard(dayKey())}',
    'moodCard(dayKey())',
    '${waterCard(dayKey())}',
    '${mealsCard(dayKey())}',
  ];
  for (const s of order) assert.ok(pos(s) > 0, s);
  for (let i = 1; i < order.length; i++)
    assert.ok(pos(order[i - 1]) < pos(order[i]), `${order[i - 1]} before ${order[i]}`);
  for (const s of ['${dailyCards()}', '${workoutCard()}']) assert.ok(pos(s) > 0, `${s} stays`);
  assert.equal(
    /measureCard|bodyCard|\$\{\w*[Mm]easure\w*\(/.test(js.slice(pos('${workoutCard()}'), pos('${QUEST_SECTIONS'))),
    false,
    'no body measurements',
  );
  assert.match(js, /\.\.\.cardActions\(\(\) => dayKey\(\)\)/, 'moodSheet / water actions come with the shared cards');
});
