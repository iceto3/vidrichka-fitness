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
