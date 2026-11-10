// 1.4.3 part A: protein breakfast switch, graded protein quest (15 / 8 / пропуснато), grams
// steppers −10/−5/+5/+10, meal totals line and the protein in „Хранене навреме“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kv, setKv } from '../../src/core/store.js';
import { dayKey } from '../../src/core/dates.js';
import { setLang, t } from '../../src/core/i18n.js';
import {
  DEFAULTS,
  dailySettings,
  proteinBreakfastOn,
  setSettings,
  storedDailySettings,
} from '../../src/core/settings.js';
import {
  MIN,
  PROTEIN_LATE_MAX,
  PROTEIN_WINDOW,
  PROTEIN_XP,
  planDay,
  proteinQuest,
} from '../../src/features/daily/logic.js';
import {
  PROTEIN_MIN_G,
  breakfastProtein,
  isLowProtein,
  isProteinDay,
  pendingMeal,
  timingDays,
  timingSummary,
} from '../../src/features/daily/mealtime.js';
import { GRAM_MAX, GRAM_STEPS, nextGrams } from '../../src/features/food/logic.js';
import { serverSettings } from '../../src/features/daily/push-format.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

await setLang('bg');
const T0 = new Date(2026, 10, 10, 7, 0, 0).getTime(); // woke 07:00 → planned 07:30
const DAY = dayKey(T0);
const rec = (/** @type {any} */ o = {}) => ({ id: DAY, proteinStart: T0, ...o });

test('protein breakfast switch: on by default (no migration), off turns protein off everywhere', () => {
  assert.equal(DEFAULTS.proteinBreakfast, true);
  setKv('settings', { daily: { protein: true } }); // an existing user: the key is missing
  assert.equal(proteinBreakfastOn(), true);
  assert.equal(dailySettings().protein, true);
  setSettings({ proteinBreakfast: false });
  assert.equal(proteinBreakfastOn(), false);
  assert.equal(dailySettings().protein, false, 'countdown, pill, banner, quest, wake start read this');
  assert.equal(storedDailySettings().protein, true, 'the reminder choice itself is kept');
  assert.equal(serverSettings(dailySettings()).protein, false, 'no protein pushes from the server');
  const cfg = dailySettings();
  assert.equal(
    planDay(DAY, /** @type {any} */ (cfg), rec()).filter((s) => s.group === 'protein').length,
    0,
    'no reminders',
  );
  assert.equal(pendingMeal(rec(), T0 + 5 * MIN, cfg.protein), null, 'no pill');
  setSettings({ proteinBreakfast: true });
  assert.equal(dailySettings().protein, true, 'on again: as before');
  assert.equal(
    planDay(DAY, /** @type {any} */ (dailySettings()), rec()).filter((s) => s.group === 'protein').length,
    3,
  );
  setKv('settings', {});
});

test('protein quest: ≤30 min 15 XP, up to 30 min late „+N мин“ 8 XP, later / skipped „пропуснато“ 0', () => {
  assert.equal(PROTEIN_WINDOW, 30);
  assert.equal(PROTEIN_LATE_MAX, 30);
  assert.deepEqual(PROTEIN_XP, { done: 15, late: 8 });
  const at = (/** @type {number} */ m) => rec({ proteinAt: T0 + m * MIN });
  assert.deepEqual(proteinQuest(at(10), T0 + 10 * MIN), { state: 'done', delayMin: 0, xp: 15 });
  assert.deepEqual(proteinQuest(at(30), T0 + 30 * MIN), { state: 'done', delayMin: 0, xp: 15 });
  assert.deepEqual(proteinQuest(at(31), T0 + 31 * MIN), { state: 'late', delayMin: 1, xp: 8 });
  assert.deepEqual(proteinQuest(at(44), T0 + 44 * MIN), { state: 'late', delayMin: 14, xp: 8 }, 'old grace is gone');
  assert.deepEqual(proteinQuest(at(60), T0 + 60 * MIN), { state: 'late', delayMin: 30, xp: 8 });
  assert.deepEqual(proteinQuest(at(61), T0 + 61 * MIN), { state: 'missed', delayMin: 31, xp: 0 });
  // the typed „Кога яде?“ time counts, not when it was logged
  const typed = rec({
    proteinAt: T0 + 95 * MIN,
    mealTimes: { breakfast: { planned: T0 + 30 * MIN, actual: T0 + 50 * MIN } },
  });
  assert.deepEqual(proteinQuest(typed, T0 + 95 * MIN), { state: 'late', delayMin: 20, xp: 8 });
  // not eaten yet: open until 60 min after waking, then missed; skipped = missed
  assert.equal(proteinQuest(rec(), T0 + 10 * MIN).state, 'open');
  assert.equal(proteinQuest(rec(), T0 + 60 * MIN).state, 'open');
  assert.equal(proteinQuest(rec(), T0 + 61 * MIN).state, 'missed');
  assert.equal(proteinQuest(rec({ proteinSkip: T0 + 5 * MIN }), T0 + 6 * MIN).state, 'missed');
  assert.equal(proteinQuest({ id: DAY }, T0).state, 'open', 'no countdown yet');
  assert.equal(proteinQuest(null, T0).state, 'open');
  assert.equal(t('quest.lateN', { n: 14 }), '+14 мин');
  assert.equal(t('quest.missed'), 'пропуснато');
});

test('graded quest XP: awarded at its grade, corrected when the grade changes, taken back when missed', async () => {
  const { registry } = await import('../../src/core/registry.js');
  const { syncRewards } = await import('../../src/features/motivation/rewards.js');
  const { quests } = await import('../../src/features/motivation/api.js');
  const today = dayKey(Date.now());
  /** @type {{done: boolean, xp: number, missed?: boolean, lateMin?: number}} */
  let st = { done: true, xp: 15 };
  registry.quests.push({ id: 'graded', label: 'quest.protein', xp: 15, done: () => st.done, state: () => st });
  try {
    setKv('xp', {});
    const amt = () => /** @type {any} */ (kv('xp', {}))[`quest:${today}:graded`]?.amt;
    syncRewards();
    assert.equal(amt(), 15);
    st = { done: true, xp: 8, lateMin: 12 };
    const q = quests().find((x) => x.id === 'graded');
    assert.deepEqual([q?.isDone, q?.gain, q?.lateMin, q?.missed], [true, 8, 12, false]);
    syncRewards();
    assert.equal(amt(), 8, 'late: corrected to 8');
    st = { done: false, xp: 0, missed: true };
    assert.equal(quests().find((x) => x.id === 'graded')?.missed, true);
    syncRewards();
    assert.equal(amt(), undefined, 'missed: no XP');
  } finally {
    registry.quests.splice(
      registry.quests.findIndex((x) => x.id === 'graded'),
      1,
    );
    setKv('xp', {});
  }
});

test('grams steppers: −10 / −5 / +5 / +10, typed values, 0…5000', () => {
  assert.deepEqual([...GRAM_STEPS], [-10, -5, 5, 10]);
  assert.equal(GRAM_MAX, 5000);
  assert.equal(nextGrams(100, { d: 5 }), 105);
  assert.equal(nextGrams(100, { d: -5 }), 95);
  assert.equal(nextGrams(100, { d: 10 }), 110);
  assert.equal(nextGrams(3, { d: -5 }), 0, 'never below 0');
  assert.equal(nextGrams(4998, { d: 5 }), 5000, 'never above 5000');
  assert.equal(nextGrams(100, { typed: '152' }), 152);
  assert.equal(nextGrams(100, { typed: '12,6' }), 13);
  assert.equal(nextGrams(100, { typed: 'abc' }), 0);
  assert.equal(nextGrams(100, { typed: '9000' }), 5000);
  const src = (/** @type {string} */ f) => readFileSync(`src/features/food/views/${f}`, 'utf8');
  for (const f of ['grams.js', 'item.js']) {
    assert.match(src(f), /gramStepper\(\{ act: 'g'/, `${f} uses the shared −10/−5/+5/+10 stepper`);
    assert.match(src(f), /gramsFrom\(g, el, ev\)/, `${f} uses the shared clamp`);
  }
});

test('meal totals line in the meals overview: „● пр 42 · ● вх 1 · ● мз 44“', () => {
  const src = readFileSync('src/features/food/views/totals.js', 'utf8');
  assert.match(src, /muted small b num block ellip mtot/);
  assert.match(src, /\['cp', 'nutr\.p', tot\.p\]/);
  assert.match(src, /\['cc', 'nutr\.c', tot\.c\]/);
  assert.match(src, /\['cf', 'nutr\.f', tot\.f\]/);
  assert.match(src, /fmtNum\(Math\.round\(Number\(v\) \|\| 0\)\)/);
  assert.deepEqual([t('nutr.p'), t('nutr.c'), t('nutr.f')], ['пр', 'вх', 'мз']);
});

test('the meal pill never shrinks (no scroll handling, no mini style)', () => {
  const js = readFileSync('src/features/daily/pill.js', 'utf8');
  assert.doesNotMatch(js, /'scroll'|mini/);
  assert.doesNotMatch(readFileSync('src/features/daily/daily.css', 'utf8'), /\.mealpill\.mini/);
});

test('„Хранене навреме“: eaten or пропусната, protein ≥ 30 g or „малко протеин · N г“, delay; summary', () => {
  assert.equal(PROTEIN_MIN_G, 30);
  const day = (/** @type {string} */ d, /** @type {number} */ h, /** @type {number} */ m) =>
    new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
  /** @type {Record<string, any>} */
  const recs = {};
  /** @type {Record<string, any[]>} */
  const food = {};
  const add = (/** @type {string} */ d, /** @type {any} */ o, /** @type {number[]} */ ps = []) => {
    recs[d] = { id: d, proteinStart: day(d, 7, 0), ...o };
    food[d] = ps.map((p, i) => ({ id: `${d}${i}`, date: d, meal: 'breakfast', p }));
  };
  add('2026-11-04', { proteinAt: day('2026-11-04', 7, 20) }, [25, 12.4]); // on time, 37 g
  add('2026-11-05', { proteinAt: day('2026-11-05', 7, 44) }, [12]); // +14, low
  add('2026-11-06', { proteinSkip: day('2026-11-06', 7, 5) }); // missed
  add('2026-11-07', { proteinAt: day('2026-11-07', 7, 25) }, [40]); // on time, protein
  add('2026-11-08', { proteinAt: day('2026-11-08', 7, 10) }); // eaten, rows gone: unknown
  add('2026-11-09', { proteinAt: day('2026-11-09', 7, 30) }, [30]); // on time, exactly 30 g
  add('2026-11-10', {}, []); // today pending
  food['2026-11-06'] = [
    { meal: 'lunch', p: 50 },
    { type: 'water', meal: 'breakfast' },
  ];
  const days = timingDays(recs, '2026-11-10', 7, food);
  assert.deepEqual(
    days.map((d) => [d.t?.status ?? null, d.protein]),
    [
      ['ontime', 37],
      ['late', 12],
      ['missed', null],
      ['ontime', 40],
      ['ontime', null],
      ['ontime', 30],
      ['pending', null],
    ],
  );
  assert.deepEqual(days.map(isLowProtein), [false, true, false, false, false, false, false]);
  assert.deepEqual(days.map(isProteinDay), [true, false, false, true, false, true, false]);
  assert.deepEqual(timingSummary(days), { onTime: 4, total: 6, late: 1, missed: 1, protein: 3, avgDelay: 14 });
  assert.equal(breakfastProtein([]), null);
  assert.equal(breakfastProtein(undefined), null);
  assert.equal(
    [
      t('mealChart.summary', { n: 5, total: 7 }),
      t('mealChart.proteinSum', { n: 6, total: 7 }),
      t('mealChart.avgDelay', { min: 14 }),
    ].join(' · '),
    'навреме 5/7 · протеинови 6/7 · средно закъснение 14 мин',
  );
  assert.equal(t('mealChart.lowProtein', { n: 12 }), 'малко протеин · 12 г');
  assert.equal(t('mealChart.missed'), 'пропусната');
});

test('part A strings exist in both languages', () => {
  for (const k of [
    'profile.proteinBreakfast',
    'profile.proteinBreakfastSub',
    'quest.lateN',
    'quest.missed',
    'mealChart.lowProtein',
    'mealChart.lowLegend',
    'mealChart.proteinSum',
    'mealChart.pending',
    'food.gramsMinus',
    'food.gramsPlus',
    'whatsNew.protein143',
    'whatsNew.grams143',
  ]) {
    assert.ok(bg[k], `bg ${k}`);
    assert.ok(en[k], `en ${k}`);
  }
});
