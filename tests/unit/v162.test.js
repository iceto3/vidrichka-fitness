// 1.6.2 tester fixes on 1.6.1-beta: the library count follows the filters, supplement
// streaks shown from day 1, every measurement opens a working form, 4 kg of added weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang } from '../../src/core/i18n.js';
import bg from '../../src/data/i18n/bg.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

test('1.6.2 fix 1: the Exercises header count follows the active filters', async () => {
  await setLang('bg');
  const L = await import('../../src/features/library/views/list.js');
  L.resetFilters();
  assert.equal(L.countLabel(), '62 упражнения');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'kettlebell' } }));
  assert.equal(L.filtered().length, 40);
  assert.equal(L.countLabel(), '40 от 62 упражнения');
  L.filterActions.place(/** @type {any} */ ({ dataset: { v: 'gym' } }));
  assert.equal(L.countLabel(), `${L.filtered().length} от 62 упражнения`);
  L.filterActions.group(/** @type {any} */ ({ dataset: { v: 'glutes' } }));
  assert.equal(L.countLabel(), `${L.filtered().length} от 62 упражнения`);
  L.resetFilters();
  assert.equal(L.countLabel(), '62 упражнения');
  await setLang('en');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'band' } }));
  assert.match(L.countLabel(), /^\d+ of 62 exercises$/);
  L.resetFilters();
  const src = readFileSync('src/features/library/views/list.js', 'utf8');
  assert.match(src, /countLabel\(\)/);
});

test('1.6.2 fix 2: the supplement streak is shown on every row, from day 1 (creatine too)', async () => {
  await setLang('bg');
  const { setKv, put } = await import('../../src/core/store.js');
  const { dayKey, addDays, parseDay } = await import('../../src/core/dates.js');
  const sa = await import('../../src/features/food/supps-api.js');
  const { suppsCard } = await import('../../src/features/food/views/supps.js');
  const today = dayKey();
  const back = (/** @type {number} */ n) => dayKey(addDays(parseDay(today), -n));
  setKv('supplements', undefined);
  setKv('creatineDose', undefined);
  put('days', { id: today });
  put('days', { id: back(1) });
  sa.addReady('vitd');
  const html0 = String(suppsCard(today));
  assert.match(html0, /suppstreak" data-n="0">🔥 0 дни подред/);
  // day 1: „Взех“ on creatine → „🔥 1 ден подред“ on the creatine row
  const cr = sa.supplements()[0];
  sa.setTaken(cr, today, cr.dose);
  const html1 = String(suppsCard(today));
  const crRow = html1.slice(html1.indexOf('data-supp="creatine"'), html1.indexOf('data-supp="vitd"'));
  assert.match(crRow, /suppstreak on" data-n="1">🔥 1 ден подред/);
  // yesterday too → 2 days; vitamin D still 0 (its own streak)
  sa.setTaken(cr, back(1), 3);
  const html2 = String(suppsCard(today));
  assert.match(html2.slice(html2.indexOf('data-supp="creatine"')), /🔥 2 дни подред/);
  assert.match(html2.slice(html2.indexOf('data-supp="vitd"')), /data-n="0"/);
  // the day view of yesterday counts up to that day
  assert.match(String(suppsCard(back(1))).slice(0, 4000), /data-n="1"/);
  sa.setTaken(cr, today, null);
  sa.setTaken(cr, back(1), null);
});

test('1.6.2 fix 3: every measurement tile (both gender sets) opens a sheet with working inputs + save', async () => {
  await setLang('bg');
  const { MEASURE_SETS, MEASURE_FIELDS } = await import('../../src/data/measurements.js');
  const { ALL_TILES, measureRow, shownTiles, tileOf } = await import('../../src/features/body/fields.js');
  const { chartHtml } = await import('../../src/features/body/views/body.js');
  const { all, put, setKv } = await import('../../src/core/store.js');
  const { dayKey } = await import('../../src/core/dates.js');
  const keys = [...new Set([...MEASURE_SETS.common, ...MEASURE_SETS.m, ...MEASURE_SETS.f, 'belly', 'bodyfat'])];
  assert.deepEqual([...keys].sort(), ALL_TILES.map((x) => x.id).sort(), 'every tile covered');
  const sample = { kg: '62.5', cm: '55', '%': '24' };
  for (const id of keys) {
    const tile = /** @type {any} */ (ALL_TILES.find((x) => x.id === id));
    const first = tile.fields[0];
    assert.equal(tileOf(first)?.id, id);
    if (first === 'weight') continue; // weight with no data keeps its own empty state („Добави тегло“)
    const out = String(chartHtml(first, { typed: {}, bad: {} }));
    for (const f of tile.fields) {
      assert.match(out, new RegExp(`id="q_${f}"[^>]*data-input="qv"[^>]*data-k="${f}"`), `${id}: input ${f}`);
      const cue = /** @type {any} */ (MEASURE_FIELDS.find((x) => x.id === f)).hint.bg;
      assert.ok(out.includes(cue), `${id}: where-to-measure cue for ${f}`);
    }
    assert.match(out, /data-act="qsave"/, `${id}: save button`);
    assert.ok(out.includes(`<h2 class="h2">${bg[`measure.${id}`]}</h2>`), `${id}: title`);
    // typed values → a saved row with every field of the tile
    const typed = Object.fromEntries(tile.fields.map((/** @type {string} */ f) => [f, sample[tile.unit]]));
    const { row, bad } = measureRow(tile.fields, typed, dayKey(), 1);
    assert.deepEqual(bad, {}, id);
    for (const f of tile.fields) assert.equal(row?.[f], Number(sample[tile.unit]), `${id}: ${f} saved`);
  }
  // nothing typed / out of range → no row, inline error
  assert.equal(measureRow(['glutes'], {}, dayKey(), 1).row, null);
  assert.equal(measureRow(['glutes'], { glutes: '5' }, dayKey(), 1).bad.glutes.error, 'body.errRange');
  const errHtml = String(
    chartHtml('glutes', { typed: { glutes: '5' }, bad: measureRow(['glutes'], { glutes: '5' }, dayKey(), 1).bad }),
  );
  assert.match(errHtml, /class="ferr" id="qh_glutes" role="alert"/);
  // a saved glutes value stays after switching gender (and its tile stays visible)
  setKv('measureTiles', undefined);
  const { row } = measureRow(['glutes'], { glutes: '98' }, dayKey(), 2);
  put('measurements', /** @type {any} */ ({ id: 'm_glutes162', ...row }));
  const rows = all('measurements');
  assert.ok(shownTiles(undefined, 'f', rows).includes('glutes'));
  assert.ok(shownTiles(undefined, 'm', rows).includes('glutes'), 'men: kept visible because it has a value');
  assert.equal(all('measurements').find((r) => r.id === 'm_glutes162')?.glutes, 98);
  assert.match(String(chartHtml('glutes', { typed: {}, bad: {} })), /98[,.]0 см/);
});
