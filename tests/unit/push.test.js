// Web Push wire format (1.2): what the app sends the push server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_OF,
  QUEUE_MAX,
  TEXT_KINDS,
  b64urlBytes,
  enqueue,
  newDeviceId,
  serverSettings,
  serverTexts,
} from '../../src/features/daily/push-format.js';
import { DAILY } from '../../src/core/settings.js';
import * as validate from '../../server/src/validate.js';

test('device ids are random and match the server format', () => {
  const a = newDeviceId(),
    b = newDeviceId();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(validate.deviceId(a), a);
});

test('VAPID key decodes to an uncompressed P-256 point', () => {
  const k = b64urlBytes('BO9JFEsnJLOmHpg2N_M9-ayXuGGZiPSJikbvjhPVEwtQjXtt3oLME6uWM3JBtmqywZrrrpB2QTC_v14cF-vqbuY');
  assert.equal(k.length, 65);
  assert.equal(k[0], 4);
});

test('settings sent to the server: times and toggles only, accepted by the server', () => {
  const s = serverSettings(/** @type {any} */ ({ ...DAILY, extra: 'x', water: DAILY.water }));
  assert.deepEqual(Object.keys(s).sort(), [
    'bedtime',
    'checkinAm',
    'checkinPm',
    'loud',
    'morning',
    'protein',
    'silent',
    'wake',
    'water',
  ]);
  assert.deepEqual(s.silent, { wake: true, bed: true });
  assert.doesNotThrow(() => validate.settings(s));
});

test('texts: one per kind with action labels, accepted by the server', () => {
  const t = serverTexts((s) => ({
    title: `T ${s.kind}`,
    body: `B ${s.group}`,
    actions: s.actions.map((a) => ({ action: a, title: `L ${a}` })),
  }));
  assert.deepEqual(Object.keys(t), [...TEXT_KINDS]);
  assert.deepEqual(t.protein, { title: 'T p10', body: 'B protein', actions: { 'protein-yes': 'L protein-yes' } });
  assert.deepEqual(t.water.actions, { 'water-add': 'L water-add' });
  assert.equal(t.wake.body, 'B morning');
  assert.doesNotThrow(() => validate.texts(t));
});

test('app events map to server events', () => {
  for (const v of Object.values(EVENT_OF)) assert.ok(validate.EVENTS.includes(v), v);
});

test('offline queue dedupes per day and is capped', () => {
  const at = Date.UTC(2026, 9, 25, 6);
  let q = enqueue([], { type: 'awake', at });
  q = enqueue(q, { type: 'awake', at: at + 1000 });
  assert.equal(q.length, 1);
  q = enqueue(q, { type: 'checkin-done', which: 'am', at });
  q = enqueue(q, { type: 'checkin-done', which: 'pm', at });
  q = enqueue(q, { type: 'awake', at: at + 864e5 });
  assert.equal(q.length, 4);
  for (let i = 0; i < 50; i++) q = enqueue(q, { type: 'water-logged', at: at + i });
  assert.equal(q.length, QUEUE_MAX);
});
