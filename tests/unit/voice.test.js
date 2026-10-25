/**
 * 1.3: voice logging (client side, pure logic). The server parser has its own tests in voice/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requestBody,
  glassesFor,
  prepare,
  withGrams,
  totalKcal,
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
  assert.deepEqual(/** @type {any} */ (o).base, { grams: 60, kcal: 230, protein: 8, carbs: 40, fat: 4 });
});

test('changing grams scales nutrition from the original estimate (no drift)', () => {
  const [o] = /** @type {any[]} */ (prepare([oats], 250));
  const a = withGrams(o, 120);
  assert.deepEqual([a.grams, a.kcal, a.protein, a.carbs, a.fat], [120, 460, 16, 80, 8]);
  const b = withGrams(withGrams(a, 7), 60); // back again: same as the start
  assert.deepEqual([b.grams, b.kcal, b.protein, b.carbs, b.fat], [60, 230, 8, 40, 4]);
  assert.equal(withGrams(o, 0).grams, 1);
  assert.equal(withGrams(o, 99999).grams, 5000);
  assert.equal(totalKcal([a, /** @type {any} */ (water)]), 460);
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
        { ...oats, name: 'банан', grams: 120, kcal: 105, meal: 'brunch' },
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
  assert.notEqual(rows[0].ts, rows[1].ts); // stable order
  assert.deepEqual(waterByDay(list), { '2026-10-25': 4, '2026-10-24': 2 });
});

test('emoji for common foods, fallback plate', () => {
  assert.equal(emojiFor('банан'), '🍌');
  assert.equal(emojiFor('Oatmeal'), '🥣');
  assert.equal(emojiFor('пилешко филе'), '🍗');
  assert.equal(emojiFor('нещо странно'), '🍽️');
});

test('voice server URL is empty until deployed, so the buttons stay hidden', () => {
  assert.equal(typeof VOICE_URL, 'string');
  if (!VOICE_URL) assert.equal(voiceUrl(), '');
  else assert.match(VOICE_URL, /^https:\/\/[^/]+\.workers\.dev$/);
});

test('every voice string exists in both languages', () => {
  const keys = Object.keys(bg).filter((k) => k.startsWith('voice.') || k.startsWith('whatsNew.voice'));
  assert.ok(keys.length >= 25);
  for (const k of keys) assert.ok(k in en, k);
  for (const c of ['offline', 'rate-limit', 'too-long', 'server']) assert.ok(`voice.err.${c}` in bg, c);
});
