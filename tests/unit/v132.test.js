/**
 * 1.3.2: combination names (required, unique, rename), the 0–500 kg set limit, localized
 * units and number formats, "vs 4 weeks ago" and the new strings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, remove, all } from '../../src/core/store.js';
import { comboNameError, renameMeal, saveMeal } from '../../src/features/food/api.js';
import { MAX_KG, clampKg } from '../../src/features/workouts/logic.js';
import { latestAndBase, TREND_DAYS } from '../../src/features/body/trend.js';
import { fmtKg, fmtVolume, setLang, t, unitText } from '../../src/core/i18n.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

const sp = (/** @type {string} */ s) => s.replace(/[\u00a0\u202f]/g, ' ');

test('combination names: required, no duplicates (any case/spacing), rename keeps its own name', () => {
  for (const m of all('meals')) remove('meals', m.id);
  assert.equal(comboNameError(''), 'food.comboNeedName');
  assert.equal(comboNameError('   '), 'food.comboNeedName');
  const a = saveMeal('Сутрешна', [{ foodId: 'egg', name: 'Яйце', grams: 55, kcal: 79, p: 7, c: 0, f: 5 }]);
  assert.equal(comboNameError('Сутрешна'), 'food.comboNameTaken');
  assert.equal(comboNameError('  сутрешна '), 'food.comboNameTaken');
  assert.equal(comboNameError('Сутрешна', a.id), null); // renaming to its own name is fine
  assert.equal(comboNameError('Следобедна'), null);
  const r = renameMeal(a.id, '  Протеинова   закуска ');
  assert.equal(r.name, 'Протеинова закуска');
  assert.equal(r.items.length, 1);
  assert.equal(comboNameError('протеинова закуска'), 'food.comboNameTaken');
  assert.equal(renameMeal('nope', 'x'), null);
  remove('meals', a.id);
});

test('set weight stays within 0–500 kg in 0.25 steps', () => {
  assert.equal(MAX_KG, 500);
  assert.equal(clampKg(520), 500);
  assert.equal(clampKg(500.1), 500);
  assert.equal(clampKg(-5), 0);
  assert.equal(clampKg(42.6), 42.5);
  assert.equal(clampKg(Number.NaN), 0);
});

test('units and decimals follow the app language', async () => {
  await setLang('bg');
  assert.equal(t('unit.g'), 'г');
  assert.equal(sp(fmtKg(42.5)), '42,5 кг');
  assert.equal(sp(fmtKg(100)), '100 кг');
  assert.equal(unitText('cm'), 'см');
  assert.equal(unitText('%'), '%');
  assert.equal(sp(fmtVolume(12400).text), '12,4 т');
  await setLang('en');
  assert.equal(t('unit.g'), 'g');
  assert.equal(fmtKg(42.5), '42.5 kg');
  assert.equal(unitText('cm'), 'cm');
});

test('"vs 4 weeks ago" only compares with an entry at least 4 weeks older', () => {
  assert.equal(TREND_DAYS, 28);
  const sameDay = [
    { date: '2026-10-25', weight: 70 },
    { date: '2026-10-25', weight: 69 },
  ];
  assert.equal(latestAndBase(sameDay, 'weight').base, undefined);
  const twoWeeks = [
    { date: '2026-10-11', weight: 71 },
    { date: '2026-10-25', weight: 69 },
  ];
  assert.equal(latestAndBase(twoWeeks, 'weight').base, undefined);
  const rows = [
    { date: '2026-09-01', weight: 74 },
    { date: '2026-09-27', weight: 72 },
    { date: '2026-10-11', weight: 71 },
    { date: '2026-10-25', weight: 69 },
  ];
  const r = latestAndBase(rows, 'weight');
  assert.equal(r.v, 69);
  assert.equal(r.base, 72); // the newest entry ≥ 28 days before the latest
  assert.equal(r.date, '2026-10-25');
  assert.deepEqual(latestAndBase([], 'weight'), { v: undefined, base: undefined, date: '' });
});

test('every 1.3.2 string exists in both languages, Bulgarian wording as agreed', () => {
  const keys = Object.keys(bg).filter((k) =>
    /^(unit\.(g|kg|cm|t)|mealTo\.\w+|food\.(comboNeedName|comboNameTaken|rename|renameTitle|renamed)|workout\.maxKg|body\.vs4wSoon|whatsNew\.(undoPill|comboRename|fixes132))$/.test(
      k,
    ),
  );
  assert.equal(keys.length, 18);
  for (const k of keys) assert.ok(k in en, k);
  assert.equal(bg['manual.errOver100'], 'Най-много 100 г на 100 г продукт.'); // 1.3.3 wording
  assert.equal(
    bg['food.tapAgain'].replace('{meal}', bg['mealTo.snack']),
    'Докосни пак, за да добавиш към междинното хранене',
  );
  // Bulgarian UI has no Latin "g" unit left in the food strings
  for (const [k, v] of Object.entries(bg))
    if (typeof v === 'string' && /^(food|manual|voice)\./.test(k)) assert.ok(!/\d g\b|\} g\b/.test(v), k);
});

test('put/remove still work after the store-driven refresh change (no listeners needed)', () => {
  put('meals', { id: 'm_x', name: 'x', items: [] });
  remove('meals', 'm_x');
  assert.equal(all('meals').length, 0);
});
