// 1.4.0 misc: feedback day limit counted on the phone, Turnstile token only when on,
// release-channel Turnstile default (off), new strings in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FB_PER_DAY, fbCounted, fbLeft, feedbackBody } from '../../src/features/improve/logic.js';
import { TURNSTILE_SITEKEY } from '../../src/core/channel.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

test('feedback: 10 messages per phone per day, a new day starts again', () => {
  assert.equal(FB_PER_DAY, 10);
  assert.equal(fbLeft(null, '2026-10-28'), 10);
  let rec = null;
  for (let i = 0; i < 10; i++) rec = fbCounted(rec, '2026-10-28');
  assert.deepEqual(rec, { day: '2026-10-28', n: 10 });
  assert.equal(fbLeft(rec, '2026-10-28'), 0);
  assert.equal(fbLeft(rec, '2026-10-29'), 10);
  assert.deepEqual(fbCounted(rec, '2026-10-29'), { day: '2026-10-29', n: 1 });
  assert.equal(fbLeft({ day: '2026-10-28', n: 99 }, '2026-10-28'), 0);
});

test('feedback body carries a Turnstile token only when there is one', () => {
  assert.ok(!('turnstile' in feedbackBody('hi', [], '1.4.0', 'bg')));
  assert.equal(feedbackBody('hi', [], '1.4.0', 'bg', 'tok').turnstile, 'tok');
  assert.equal(TURNSTILE_SITEKEY, '', 'Turnstile is off until a widget exists');
});

test('every 1.4.0 key exists in both languages', () => {
  const pre = ['day.', 'shot.', 'scale.', 'feedback.thanks', 'feedback.shotsCount', 'feedback.leftToday'];
  const keys = Object.keys(bg).filter((k) => pre.some((p) => k.startsWith(p)));
  assert.ok(keys.length > 50);
  for (const k of keys) assert.ok(k in en, `${k} in en`);
});

test("What's new: items of every release newer than the one seen; flags hide voice/push items", async () => {
  const { NOTES, newSince, older, parseV } = await import('../../src/features/whatsnew/notes.js');
  assert.deepEqual(parseV('1.2'), [1, 2, 0]);
  assert.deepEqual(parseV('1.4.0-beta-abc'), [1, 4, 0]);
  assert.ok(older('1.3.4', '1.4.0') && !older('1.4.0', '1.4.0') && older('', '1.2.0'));
  const on = { voice: true, push: true };
  const from = (seen, f = on) => newSince(seen, f, NOTES, '1.4.0').items.map(([, k]) => k); // as shipped in 1.4.0
  assert.deepEqual(from('1.4.0'), []);
  assert.ok(from('1.3.4').includes('whatsNew.dayView') && !from('1.3.4').includes('whatsNew.homeMeals'));
  assert.equal(from('1.3.3').length, 8 + 6);
  assert.equal(from('1.3.1').length, 8 + 6 + 2 + 3);
  assert.ok(!from('1.3.3', { voice: false, push: false }).includes('whatsNew.shot'));
  assert.ok(!from('1.2').includes('whatsNew.proteinBar') && from('1.2').includes('whatsNew.photos'));
  const fresh = newSince('', on);
  assert.ok(fresh.gender && fresh.push && fresh.items.some(([, k]) => k === 'whatsNew.push'));
  assert.equal(newSince('', { voice: false, push: false }).push, false);
  for (const r of NOTES) for (const [, k] of r.items) assert.ok(k in bg && k in en, k);
});

test('weight trend: latest weigh-in of each day, gaps stay empty, a readable range', async () => {
  const { weightSeries, weightRange, isEmpty } = await import('../../src/features/progress/trends.js');
  const m = [
    { date: '2026-10-26', weight: 80, ts: 1 },
    { date: '2026-10-26', weight: 79.6, ts: 2 },
    { date: '2026-10-28', weight: 79.1, ts: 3 },
    { date: '2026-10-27', waist: 80 },
  ];
  const pts = weightSeries(m, 3, '2026-10-28', false);
  assert.deepEqual(
    pts.map((p) => p.y),
    [79.6, null, 79.1],
  );
  const r = weightRange(pts);
  assert.ok(r.min <= 79.1 && r.max >= 79.6 && r.step === 1);
  assert.equal(weightRange([{ y: null }]), null);
  assert.ok(isEmpty([{ y: null }, { y: 0 }]) && !isEmpty(pts));
});

test('monthly recap includes steps, sleep, mood and water of the month only', async () => {
  const { monthRecap } = await import('../../src/features/motivation/recap.js');
  const r = monthRecap('2026-10', {
    sessions: [],
    food: [
      { type: 'water', date: '2026-10-02', glasses: 6 },
      { type: 'water', date: '2026-09-30', glasses: 9 },
    ],
    measurements: [],
    badges: {},
    days: [
      { id: '2026-10-01', steps: 8000, sleepH: 7, mood: 4 },
      { id: '2026-10-02', steps: 12000, sleepH: 8, mood: 5 },
      { id: '2026-09-30', steps: 50000, sleepH: 3 },
    ],
  });
  assert.deepEqual(
    [r.stepDays, r.avgSteps, r.bestSteps, r.stepsTotal, r.sleepNights, r.avgSleep, r.avgMood, r.avgWater],
    [2, 10000, 12000, 20000, 2, 7.5, 4.5, 6],
  );
});

test("What's new never shows notes of a release newer than the running one", async () => {
  const { newSince, allNotes } = await import('../../src/features/whatsnew/notes.js');
  const f = { voice: true, push: true };
  assert.ok(!newSince('1.3.3', f, undefined, '1.3.4').items.some(([, k]) => k === 'whatsNew.dayView'));
  assert.equal(allNotes(f, '1.3.4')[0].v, '1.3.4');
  assert.equal(allNotes(f, '1.4.0')[0].v, '1.4.0');
});
