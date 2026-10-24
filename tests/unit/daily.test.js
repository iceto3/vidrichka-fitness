// Daily rhythm: reminder scheduling, protein countdown, sleep hours and bedtime estimate,
// plus the service worker's copy of dueSlots().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAILY } from '../../src/core/settings.js';
import {
  MIN,
  at,
  dueSlots,
  estimateBedtime,
  eveningKey,
  fillBedtime,
  nights,
  planDay,
  planRange,
  proteinState,
  sleepHours,
  sleepStreak,
} from '../../src/features/daily/logic.js';

const D = '2026-10-20'; // a Tuesday (no DST change around it)
const T = (time, plus = 0) => at(D, time, plus);
const cfg = structuredClone(DAILY);
/** Due slots at `time` given the day's record (convenience). */
const due = (time, rec = {}, c = cfg) => {
  const now = T(time);
  return dueSlots(planRange(now, 1, c, { [D]: rec }), now, { [D]: rec });
};
const kinds = (r) => r.show.map((s) => s.kind).sort();

test('7:30 nudge is silent; 8:15 alarm is loud and replaces it', () => {
  const day = planDay(D, cfg);
  const wake = day.find((s) => s.kind === 'wake'),
    loud = day.find((s) => s.kind === 'loud');
  assert.equal(wake.at, T('07:30'));
  assert.equal(wake.silent, true);
  assert.equal(loud.at, T('08:15'));
  assert.equal(loud.loud, true);
  assert.ok(!loud.silent);
  assert.deepEqual(kinds(due('07:31')), ['wake']);
  // Phone opened at 08:20 with nothing tapped: only the loud one (the 7:30 one is stale).
  assert.deepEqual(kinds(due('08:20')), ['loud']);
  // Both due at once (caught up late, e.g. 7:30 never delivered): one per group, both marked seen.
  const both = dueSlots(planDay(D, { ...cfg, loud: '07:31' }), T('07:31'), {});
  assert.deepEqual(kinds(both), ['loud']);
});

test('8:15 alarm is skipped once the 7:30 one was tapped or #morning was opened', () => {
  assert.deepEqual(kinds(due('08:16', { ack: T('07:35') })), []);
  assert.deepEqual(kinds(due('08:16', { wake: T('07:50') })), []);
  // …and is not repeated once shown.
  assert.deepEqual(kinds(due('08:30', { shown: { wake: T('07:30'), loud: T('08:15') } })), []);
});

test('protein reminders at +10/+20/+30 min stop after "yes"', () => {
  const start = T('07:40');
  const rec = { wake: start, ack: start, proteinStart: start };
  const ps = planDay(D, cfg, rec).filter((s) => s.group === 'protein');
  assert.deepEqual(
    ps.map((s) => (s.at - start) / MIN),
    [10, 20, 30],
  );
  assert.ok(ps.every((s) => s.actions.includes('protein-yes') && s.route === 'morning'));
  assert.deepEqual(kinds(due('07:51', rec)), ['p10']);
  assert.deepEqual(kinds(due('08:01', { ...rec, shown: { p10: 1 } })), ['p20']);
  assert.deepEqual(kinds(due('08:01', { ...rec, proteinAt: T('07:55') })), []);
  assert.deepEqual(kinds(due('08:11', { ...rec, proteinAt: T('08:05') })), []);
  // No wake-up yet: no protein reminders at all.
  assert.equal(planDay(D, cfg, {}).filter((s) => s.group === 'protein').length, 0);
});

test('protein countdown survives reloads (computed from the stored start)', () => {
  const start = T('07:40');
  assert.equal(proteinState({ proteinStart: start }, start + 12 * MIN).left, 18 * MIN);
  assert.equal(proteinState({ proteinStart: start }, start + 31 * MIN).state, 'late');
  const done = proteinState({ proteinStart: start, proteinAt: start + 25 * MIN }, start + 40 * MIN);
  assert.deepEqual([done.state, done.onTime], ['done', true]);
  assert.equal(proteinState({ proteinStart: start, proteinAt: start + 70 * MIN }, start + 80 * MIN).onTime, false);
  assert.equal(proteinState({}, start).state, 'idle');
});

test('water reminders: editable/toggleable, one at a time, stale ones dropped', () => {
  const c = { ...structuredClone(cfg), morning: false, checkinAm: { time: '11:00', on: false } };
  c.water[1] = { time: '14:30', on: false };
  const w = planDay(D, c).filter((s) => s.group === 'water');
  assert.deepEqual(
    w.map((s) => s.kind),
    ['water0', 'water2', 'water3'],
  );
  assert.ok(w.every((s) => s.actions.includes('water-add') && s.route === 'food?water'));
  assert.equal(w[0].until, T('17:00')); // valid until the next one
  assert.deepEqual(kinds(due('11:05', {}, c)), ['water0']);
  assert.deepEqual(kinds(due('17:10', {}, c)), ['water2']); // 11:00 is stale by now
});

test('check-ins and bedtime nudge', () => {
  const up = { wake: T('07:30') }; // morning handled
  assert.deepEqual(kinds(due('11:00', up)), ['checkinAm', 'water0']);
  assert.deepEqual(kinds(due('11:00', { ...up, mood: 4, shown: { water0: 1 } })), []);
  assert.deepEqual(kinds(due('19:31', { shown: { water2: 1 } })), ['checkinPm']);
  const bed = planDay(D, cfg).find((s) => s.kind === 'bed');
  assert.equal(bed.at, T('22:30'));
  assert.equal(bed.silent, true);
  assert.equal(bed.route, 'goodnight');
  assert.deepEqual(kinds(due('22:40', { shown: { water3: 1 }, energy: 3 })), ['bed']);
  assert.deepEqual(kinds(due('22:40', { shown: { water3: 1 }, energy: 3, bed: T('22:35') })), []);
});

test('turning the morning flow off removes both morning reminders', () => {
  const c = { ...cfg, morning: false };
  assert.equal(planDay(D, c).filter((s) => s.group === 'morning').length, 0);
});

test('sleep hours = next wake − bedtime', () => {
  assert.equal(sleepHours(T('23:15'), T('07:00', 1)), 7.8);
  assert.equal(sleepHours(T('00:30', 1), T('08:00', 1)), 7.5);
  assert.equal(sleepHours(null, T('07:00')), null);
  assert.equal(sleepHours(T('07:00', 1), T('06:00', 1)), null); // negative
  assert.equal(sleepHours(T('20:00'), T('15:00', 1)), null); // 19 h: implausible
});

test('evenings run until 04:00; forgotten bedtime is estimated from the last evening use', () => {
  assert.equal(eveningKey(T('01:30', 1)), D);
  assert.equal(eveningKey(T('04:30', 1)), '2026-10-21');
  assert.equal(estimateBedtime(T('23:40'), D), T('23:40'));
  assert.equal(estimateBedtime(T('01:10', 1), D), T('01:10', 1));
  assert.equal(estimateBedtime(T('18:00'), D), null); // too early to mean bedtime
  assert.equal(estimateBedtime(undefined, D), null);
  assert.deepEqual(fillBedtime({ id: D, lastUse: T('23:40') }), { bed: T('23:40'), bedEst: true });
  assert.equal(fillBedtime({ id: D, bed: T('22:00'), lastUse: T('23:40') }), null); // a real one wins
});

test('nights pair the evening bedtime with the next wake-up; streak skips estimates', () => {
  const rows = [
    { id: '2026-10-18', bed: at('2026-10-18', '22:50') },
    { id: '2026-10-19', wake: at('2026-10-19', '07:20'), bed: at('2026-10-19', '23:30'), mood: 4 },
    { id: D, wake: T('07:00'), sleepQ: 5, bed: T('23:00'), bedEst: true },
  ];
  const n = nights(rows, 3, D);
  assert.deepEqual(
    n.map((x) => x.hours),
    [7.5, 8.5, null],
  );
  assert.equal(n[0].sleepQ, 5);
  assert.equal(sleepStreak(rows, T('12:00')), 2); // 18th + 19th; the 20th is only estimated
  assert.equal(sleepStreak(rows, T('12:00', 2)), 0);
});

test('service worker carries an identical dueSlots()', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const m = sw.match(/\/\/ <due>\n([\s\S]*?)\/\/ <\/due>/);
  assert.ok(m, 'sw.js has // <due> markers');
  const swDue = new Function(`${m[1]}; return dueSlots;`)();
  const rec = { proteinStart: T('07:40'), ack: T('07:40'), shown: { wake: 1 } };
  for (const time of ['07:31', '08:20', '07:55', '11:00', '17:10', '22:40', '23:59']) {
    const now = T(time),
      slots = planRange(now, 1, cfg, { [D]: rec });
    assert.deepEqual(swDue(slots, now, { [D]: rec }), dueSlots(slots, now, { [D]: rec }), time);
  }
});
