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

test('4b: each „Часове сън“ bar is a button that opens that night’s sleep editor', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync('src/features/daily/views/sleep.js', 'utf8');
  assert.match(js, /<button type="button" class="sb[^"]*\$\{[^`]*data-act="sleepDay" data-d="\$\{n\.day\}"/);
  assert.match(js, /sleepDay: async \(el\) =>[\s\S]*openSleepSheet\(d\)/);
  assert.match(js, /role="group" aria-label="\$\{t\('sleep\.hours'\)\}"/, 'no longer a plain picture');
  for (const k of ['sleep.tapBar', 'sleep.editNight'])
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
});

test('4b: an empty past night is filled in from its bar; same rules – 16 h cap, wake-up not after breakfast', async () => {
  globalThis.addEventListener ??= () => {};
  const { addDays, dayKey } = await import('../../src/core/dates.js');
  const { all, get, put, remove } = await import('../../src/core/store.js');
  const { at } = await import('../../src/features/daily/logic.js');
  const { setDaySleepTimes, sleepEditorTimes } = await import('../../src/features/day/api.js');
  const { sleepNights } = await import('../../src/features/daily/api.js');
  for (const st of ['food', 'days']) all(st).forEach((r) => remove(st, r.id));
  const P = dayKey(addDays(new Date(), -3));
  assert.equal(sleepNights(14).find((n) => n.day === P)?.hours, null, 'empty bar');
  const open = sleepEditorTimes(P);
  assert.ok(open.bed && open.wake, 'the editor opens with times to start from');
  setDaySleepTimes(P, { bed: '23:30', wake: '07:00' });
  assert.equal(get('days', P).sleepWake, at(P, '07:00'));
  assert.equal(sleepNights(14).find((n) => n.day === P)?.hours, 7.5, 'the bar shows it');
  // corrected later, still within the rules
  setDaySleepTimes(P, { bed: '23:00', wake: '06:30' });
  assert.equal(sleepNights(14).find((n) => n.day === P)?.hours, 7.5);
  // more than 16 h stays refused (the cap is unchanged)
  assert.throws(() => setDaySleepTimes(P, { bed: '12:00', wake: '06:30', shift: -1 }), { code: 'sleepLong' });
  // a past day's breakfast at 07:10: a wake-up after it is refused like today
  put('food', {
    id: 'bfP',
    date: P,
    meal: 'breakfast',
    ts: at(P, '07:10'),
    time: '07:10',
    name: 'Яйца',
    grams: 100,
    kcal: 140,
    p: 12,
    c: 1,
    f: 10,
  });
  assert.throws(() => setDaySleepTimes(P, { bed: '23:00', wake: '07:30' }), { code: 'wakeAfterBreakfast' });
  setDaySleepTimes(P, { bed: '23:00', wake: '07:00' });
  assert.equal(get('days', P).sleepWake, at(P, '07:00'), 'before the breakfast is fine');
});

test("1.5.1: version, What's new (bg + en), no English in Bulgarian", async () => {
  const { readFileSync } = await import('node:fs');
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  // the version itself is checked by the newest release's test (1.6.0: v160.test.js)
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.5\.1\]/);
  const rel = NOTES.find((r) => r.v === '1.5.1');
  assert.equal(rel?.items.length, 4);
  const keys = [
    ...(rel?.items ?? []).map(([, k]) => k),
    'food.satFat',
    'food.sugar',
    'nutr.sat',
    'nutr.sug',
    'manual.sat',
    'manual.sug',
    'sleep.tapBar',
    'sleep.editNight',
  ];
  for (const k of keys) {
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
    assert.doesNotMatch(String(/** @type {any} */ (bg)[k]).replace(/\{\w+\}/g, ''), /[A-Za-z]/, `English in bg ${k}`);
  }
});

test('meal clock (user decision): one clock per meal moves every food in it, unplanned meals too', async () => {
  globalThis.addEventListener ??= () => {};
  const { dayKey } = await import('../../src/core/dates.js');
  const { all, get, put, remove } = await import('../../src/core/store.js');
  const { at } = await import('../../src/features/daily/logic.js');
  await import('../../src/features/daily/index.js');
  const { setMealClock } = await import('../../src/features/daily/api.js');
  const { editRow, logFood } = await import('../../src/features/food/api.js');
  const { FOODS } = await import('../../src/data/foods.js');
  const { mealHM } = await import('../../src/features/food/logic.js');
  for (const st of ['food', 'days']) all(st).forEach((r) => remove(st, r.id));
  const D = dayKey();
  const realNow = Date.now;
  Date.now = () => at(D, '09:00');
  try {
    put('days', { id: D, wake: at(D, '07:00'), ack: at(D, '07:00') });
    const row = (/** @type {string} */ id, /** @type {string} */ meal, /** @type {string} */ hm) =>
      put('food', { id, date: D, meal, ts: at(D, hm), time: hm, name: id, grams: 100, kcal: 100, p: 10, c: 1, f: 5 });
    // the tester's case: egg and chicken in lunch at 08:49, the lunch clock to 08:29
    row('egg', 'lunch', '08:49');
    row('chicken', 'lunch', '08:49');
    assert.equal(setMealClock(D, 'lunch', '08:29').ok, true);
    for (const id of ['egg', 'chicken']) assert.equal(get('food', id)?.time, '08:29', `${id} moved with the meal`);
    // a new food takes the meal's time
    const banana = FOODS.find((f) => f.id === 'banana') ?? FOODS[0];
    const added = logFood(banana, 120, 'lunch', D);
    assert.equal(added.time, '08:29');
    // old data with mixed times: the clock shows the earliest, nothing is rewritten until changed
    row('o1', 'dinner', '08:40');
    row('o2', 'dinner', '08:35');
    assert.equal(mealHM(all('food'), D, 'dinner'), '08:35');
    assert.equal(get('food', 'o1')?.time, '08:40', 'left as it was');
    setMealClock(D, 'dinner', '08:45');
    assert.deepEqual([get('food', 'o1')?.time, get('food', 'o2')?.time], ['08:45', '08:45']);
    // an unplanned meal has one clock too
    row('x1', 'x_abc', '08:10');
    row('x2', 'x_abc', '08:10');
    setMealClock(D, 'x_abc', '08:20');
    assert.deepEqual([get('food', 'x1')?.time, get('food', 'x2')?.time], ['08:20', '08:20']);
    // moved to another meal: it takes that meal's time
    editRow('x1', { meal: 'lunch' });
    assert.equal(get('food', 'x1')?.time, '08:29');
    // the rules stay: not before the wake-up, not in the future
    assert.deepEqual(setMealClock(D, 'lunch', '06:30'), { ok: false, err: 'early' });
    assert.equal(setMealClock(D, 'lunch', '09:30').ok, false);
    assert.equal(get('food', 'egg')?.time, '08:29');
  } finally {
    Date.now = realNow;
  }
});

test('meal clock UI: the meal sheet has the one clock, food rows and the item editor have none', async () => {
  const { readFileSync } = await import('node:fs');
  const item = readFileSync('src/features/food/views/item.js', 'utf8');
  assert.doesNotMatch(item, /time24|itemtime|setFoodTime|data-act="hm/, 'no time control on an item');
  const diary = readFileSync('src/features/food/views/diary.js', 'utf8');
  const sheet = diary.slice(diary.indexOf('export function openMeal'), diary.indexOf('/** @returns'));
  assert.match(sheet, /class="row gap10 mt8 mealclk"/);
  assert.match(sheet, /time24\(\{ value: clk\.typed \?\? clk\.hm, act: 'mclk', step: 'mclkstep', mins: 5/);
  assert.match(sheet, /setMealClock\(day, meal, clk\.hm\)/);
  assert.match(sheet, /onClose: \(\) => void applyClock\(\)/, 'kept when the sheet is left');
  assert.doesNotMatch(sheet, /\$\{r\.time\}/, 'a food row shows no time');
  for (const k of ['food.mealTimeChanged', 'food.saveMealTime'])
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
});
