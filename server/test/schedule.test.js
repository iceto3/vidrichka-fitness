// Per-device due-reminder computation: time zones, DST, skip rules and dedupe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueNow, localParts, toInstant, MIN } from '../src/schedule.js';
import { SETTINGS, TZ, sofia } from './helpers.js';

const D = '2026-10-20';
const due = (iso, { flags = {}, sent = {}, settings = SETTINGS, tz = TZ } = {}) =>
  dueNow({ tz, settings, now: sofia(iso), flags, sent }).map((s) => s.kind);

test('wall-clock times become instants in the device zone', () => {
  assert.equal(toInstant(TZ, D, 7 * 60 + 30), Date.parse('2026-10-20T07:30:00+03:00'));
  assert.equal(toInstant('America/New_York', D, 7 * 60 + 30), Date.parse('2026-10-20T07:30:00-04:00'));
  assert.deepEqual(localParts(TZ, Date.parse('2026-10-20T04:30:00Z')).day, D);
  assert.equal(localParts(TZ, Date.parse('2026-10-20T04:30:00Z')).min, 7 * 60 + 30);
});

test('7:30 silent nudge is due at 7:30 and within the grace window, not before', () => {
  assert.deepEqual(due(`${D}T07:29`), []);
  assert.deepEqual(due(`${D}T07:30`), ['wake']);
  assert.deepEqual(due(`${D}T07:50`), ['wake']);
  const s = dueNow({ tz: TZ, settings: SETTINGS, now: sofia(`${D}T07:30`), flags: {}, sent: {} })[0];
  assert.equal(s.silent, true);
  assert.equal(s.route, 'morning');
});

test('each reminder is sent once per day (dedupe)', () => {
  assert.deepEqual(due(`${D}T07:31`, { sent: { [D]: ['wake'] } }), []);
  assert.deepEqual(due('2026-10-21T07:31', { sent: { [D]: ['wake'] } }), ['wake']);
});

test('8:15 loud alarm only if the morning was not acknowledged', () => {
  assert.deepEqual(due(`${D}T08:15`, { sent: { [D]: ['wake'] } }), ['loud']);
  assert.deepEqual(
    due(`${D}T08:15`, { flags: { [D]: { ack_at: sofia(`${D}T07:40`), protein_done: 1 } }, sent: { [D]: ['wake'] } }),
    [],
  );
  const s = dueNow({ tz: TZ, settings: SETTINGS, now: sofia(`${D}T08:15`), flags: {}, sent: {} });
  assert.deepEqual(
    s.map((x) => [x.kind, x.loud, x.silent]),
    [['loud', true, false]],
    'at 8:15 only the loud one (it replaces 7:30)',
  );
});

test('protein reminders at +10/+20/+30 from the acknowledgement until done', () => {
  const ack = sofia(`${D}T07:42`);
  const flags = { [D]: { ack_at: ack } };
  assert.deepEqual(due(`${D}T07:51`, { flags }), []);
  assert.deepEqual(due(`${D}T07:52`, { flags }), ['p10']);
  assert.deepEqual(due(`${D}T08:02`, { flags, sent: { [D]: ['p10'] } }), ['p20']);
  assert.deepEqual(due(`${D}T08:12`, { flags, sent: { [D]: ['p10', 'p20'] } }), ['p30']);
  assert.deepEqual(due(`${D}T08:12`, { flags: { [D]: { ack_at: ack, protein_done: ack + 5 * MIN } } }), []);
  const p = dueNow({ tz: TZ, settings: SETTINGS, now: ack + 10 * MIN, flags, sent: {} })[0];
  assert.deepEqual(p.actions, ['protein-yes']);
  assert.deepEqual(due(`${D}T07:52`, { flags, settings: { ...SETTINGS, protein: false } }), []);
});

test('water, check-ins and goodnight follow their toggles and done flags', () => {
  assert.deepEqual(due(`${D}T11:00`).sort(), ['checkinAm', 'water0']);
  assert.deepEqual(due(`${D}T11:00`, { flags: { [D]: { checkin_am: 1 } } }), ['water0']);
  const off = { ...SETTINGS, water: SETTINGS.water.map((w, i) => ({ ...w, on: i !== 0 })) };
  assert.deepEqual(due(`${D}T11:00`, { settings: off }), ['checkinAm']);
  assert.deepEqual(due(`${D}T19:30`), ['checkinPm']);
  assert.deepEqual(due(`${D}T19:30`, { flags: { [D]: { checkin_pm: 1 } } }), []);
  assert.deepEqual(due(`${D}T22:30`), ['bed']);
  assert.deepEqual(due(`${D}T22:30`, { flags: { [D]: { goodnight: 1 } } }), []);
  const w = dueNow({ tz: TZ, settings: SETTINGS, now: sofia(`${D}T14:00`), flags: {}, sent: {} })[0];
  assert.deepEqual([w.route, w.actions], ['food?water', ['water-add']]);
});

test('no stale reminders: a slot is only sent within 30 min of its time', () => {
  assert.deepEqual(due(`${D}T11:31`, { flags: { [D]: { checkin_am: 1 } } }), []);
  assert.deepEqual(due(`${D}T15:00`), []);
});

test('a bedtime after midnight belongs to the previous evening', () => {
  const late = { ...SETTINGS, bedtime: { time: '00:30', on: true } };
  assert.deepEqual(due('2026-10-21T00:30', { settings: late }), ['bed']);
  const s = dueNow({ tz: TZ, settings: late, now: sofia('2026-10-21T00:30'), flags: {}, sent: {} })[0];
  assert.equal(s.day, D);
  assert.deepEqual(due('2026-10-21T00:30', { settings: late, flags: { [D]: { goodnight: 1 } } }), []);
});

test('DST fall-back (Europe/Sofia, 25 Oct 2026: UTC+3 → UTC+2) keeps local times and sends once', () => {
  const day = '2026-10-25';
  assert.equal(toInstant(TZ, day, 7 * 60 + 30), Date.parse('2026-10-25T07:30:00+02:00'));
  assert.equal(toInstant(TZ, '2026-10-24', 7 * 60 + 30), Date.parse('2026-10-24T07:30:00+03:00'));
  // 03:30 happens twice; the reminder is due at the later one and the dedupe keeps it single.
  const s = { ...SETTINGS, morning: true, wake: '03:30', loud: '05:00' };
  const first = Date.parse('2026-10-25T03:30:00+03:00'),
    second = Date.parse('2026-10-25T03:30:00+02:00');
  assert.deepEqual(dueNow({ tz: TZ, settings: s, now: first, flags: {}, sent: {} }), []);
  assert.deepEqual(
    dueNow({ tz: TZ, settings: s, now: second, flags: {}, sent: {} }).map((x) => x.kind),
    ['wake'],
  );
  assert.deepEqual(dueNow({ tz: TZ, settings: s, now: second + MIN, flags: {}, sent: { [day]: ['wake'] } }), []);
});

test('DST spring-forward: a time inside the gap still fires (shifted by the gap)', () => {
  // 29 Mar 2026: 03:00 → 04:00 in Sofia.
  const s = { ...SETTINGS, wake: '03:30', loud: '06:00' };
  const at = toInstant(TZ, '2026-03-29', 3 * 60 + 30);
  assert.equal(at, Date.parse('2026-03-29T04:30:00+03:00'));
  assert.deepEqual(
    dueNow({ tz: TZ, settings: s, now: at, flags: {}, sent: {} }).map((x) => x.kind),
    ['wake'],
  );
});

test('every device uses its own zone', () => {
  const kinds = (tz, iso) =>
    dueNow({ tz, settings: SETTINGS, now: Date.parse(iso), flags: {}, sent: {} }).map((s) => s.kind);
  assert.deepEqual(kinds('America/New_York', '2026-10-20T11:00:00Z'), []); // 07:00 there
  assert.deepEqual(kinds(TZ, '2026-10-20T11:00:00Z'), ['water1']); // 14:00 in Sofia
  assert.deepEqual(kinds('America/New_York', '2026-10-20T11:30:00Z'), ['wake']); // 07:30 there
});
