/**
 * 1.3: voice logging (client side, pure logic). The server parser has its own tests in voice/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requestBody,
  glassesFor,
  prepare,
  assignMeals,
  entryTs,
  foodRows,
  waterByDay,
  emojiFor,
  MAX_TEXT,
} from '../../src/features/voice/logic.js';
import { voiceUrl, VOICE_URL } from '../../src/features/voice/config.js';
import en from '../../src/data/i18n/en.js';
import bg from '../../src/data/i18n/bg.js';

const now = new Date(2026, 9, 25, 13, 5); // local 2026-10-25 13:05
const oats = {
  type: 'food',
  name: 'овесени ядки',
  amount: '1 купа',
  grams: 60,
  kcal: 230,
  protein: 8,
  carbs: 40,
  fat: 4,
  meal: 'breakfast',
  date: '2026-10-25',
  time: '08:15',
};
const water = { type: 'water', amount_ml: 500, meal: 'breakfast', date: '2026-10-25', time: null };

test('requestBody sends only the text plus local date/time/zone/lang, collapsed and capped', () => {
  const b = requestBody(`  изядох   банан\n${'x'.repeat(900)}`, now, 'bg');
  assert.deepEqual(Object.keys(b).sort(), ['lang', 'text', 'time', 'today', 'tz']);
  assert.equal(b.today, '2026-10-25');
  assert.equal(b.time, '13:05');
  assert.equal(b.lang, 'bg');
  assert.ok(b.text.startsWith('изядох банан x'));
  assert.equal(b.text.length, MAX_TEXT);
  assert.ok(b.tz.length > 0);
});

test('water converts to glasses of the configured size (at least one)', () => {
  assert.equal(glassesFor(500, 250), 2);
  assert.equal(glassesFor(330, 250), 1);
  assert.equal(glassesFor(50, 250), 1);
  assert.equal(glassesFor(1500, 300), 5);
  const [o, w] = prepare([oats, water], 250);
  assert.equal(/** @type {any} */ (w).glasses, 2);
  assert.deepEqual(o, oats); // food entries are saved as the server estimated them
});

test('1.3.1: the meal named in the sentence wins; else a said time / past day keeps the server meal; else screen or current meal', () => {
  const today = '2026-10-25';
  const base = { ...oats, time: null, meal: 'lunch', meal_named: false };
  const pick = (/** @type {any} */ e, /** @type {any} */ o = {}) =>
    assignMeals([e], { today, defaultMeal: 'lunch', ...o })[0].meal;
  // "запиши в закуска две кебапчета…" at 13:05 → breakfast, even from Food › Add dinner
  assert.equal(pick({ ...base, meal: 'breakfast', meal_named: true }), 'breakfast');
  assert.equal(pick({ ...base, meal: 'breakfast', meal_named: true }, { screenMeal: 'dinner' }), 'breakfast');
  // nothing named, today, no time → the screen's meal, else the current meal
  assert.equal(pick({ ...base, meal: 'snack' }, { screenMeal: 'dinner' }), 'dinner');
  assert.equal(pick({ ...base, meal: 'snack' }), 'lunch');
  // a said time or a past day keeps what the server inferred
  assert.equal(pick({ ...base, meal: 'breakfast', time: '08:00' }, { screenMeal: 'dinner' }), 'breakfast');
  assert.equal(pick({ ...base, meal: 'dinner', date: '2026-10-24' }, { screenMeal: 'lunch' }), 'dinner');
  // older servers without meal_named behave like "not named"
  const { meal_named: _n, ...old } = base;
  assert.equal(pick({ ...old, meal: 'breakfast' }, { screenMeal: 'snack' }), 'snack');
  // water follows the same rules
  assert.equal(pick({ ...water, meal: 'breakfast', meal_named: true }, { screenMeal: 'snack' }), 'breakfast');
});

test('entry time: its own time, else now for today, else the usual meal time', () => {
  assert.equal(entryTs(oats, now), new Date(2026, 9, 25, 8, 15).getTime());
  assert.equal(entryTs({ ...oats, time: null }, now), now.getTime());
  assert.equal(
    entryTs({ ...oats, date: '2026-10-24', time: null, meal: 'dinner' }, now),
    new Date(2026, 9, 24, 19, 30).getTime(),
  );
});

test('foodRows makes diary rows in the food store shape; water is summed per day', () => {
  const list = /** @type {any[]} */ (
    prepare(
      [
        oats,
        { ...oats, name: 'банан', grams: 120, kcal: 105, meal: 'brunch', fiber: 3.1, salt: 0 },
        water,
        { ...water, date: '2026-10-24' },
        water,
      ],
      250,
    )
  );
  const rows = foodRows(list, now);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { ...rows[0], ts: 0 },
    {
      date: '2026-10-25',
      meal: 'breakfast',
      ts: 0,
      time: '08:15',
      name: 'овесени ядки',
      emoji: '🥣',
      grams: 60,
      kcal: 230,
      p: 8,
      c: 40,
      f: 4,
      source: 'voice',
    },
  );
  assert.equal(rows[1].meal, 'snack'); // unknown meal falls back
  assert.equal(rows[1].fib, 3.1); // fiber / salt come along when the server sent them
  assert.equal(rows[1].salt, 0);
  assert.ok(!('fib' in rows[0]) && !('salt' in rows[0])); // … and stay unknown otherwise
  assert.notEqual(rows[0].ts, rows[1].ts); // stable order
  assert.deepEqual(waterByDay(list), { '2026-10-25': 4, '2026-10-24': 2 });
});

test('emoji for common foods, fallback plate', () => {
  assert.equal(emojiFor('банан'), '🍌');
  assert.equal(emojiFor('Oatmeal'), '🥣');
  assert.equal(emojiFor('пилешко филе'), '🍗');
  assert.equal(emojiFor('нещо странно'), '🍽️');
  assert.equal(emojiFor('лютеница'), '🥫');
  assert.equal(emojiFor('кебапчета'), '🥩');
});

test('voice server URL is empty until deployed, so the buttons stay hidden', () => {
  assert.equal(typeof VOICE_URL, 'string');
  if (!VOICE_URL) assert.equal(voiceUrl(), '');
  else assert.match(VOICE_URL, /^https:\/\/[^/]+\.workers\.dev$/);
});

test('every voice string exists in both languages', () => {
  const keys = Object.keys(bg).filter((k) => k.startsWith('voice.') || k.startsWith('whatsNew.voice'));
  assert.ok(keys.length >= 18);
  for (const k of keys) assert.ok(k in en, k);
  for (const c of ['offline', 'rate-limit', 'too-long', 'server']) assert.ok(`voice.err.${c}` in bg, c);
});
