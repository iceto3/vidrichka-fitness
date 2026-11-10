/**
 * 1.5.1 e2e (run from smoke.mjs after the 1.5.0 flow, or alone with `--flow v151`) at 360 px:
 * part 3 – saturated fat and sugar in the manual-food form, the add sheet and Храна's totals;
 * herring in the food list; part 4 – mood / energy and water on Начало, and a bar of
 * Прогрес › Сън „Часове сън“ opening that night's sleep editor.
 */
import assert from 'node:assert/strict';

/** @param {any} page */
const idbPut = (page) => (/** @type {string} */ store, /** @type {any[]} */ recs) =>
  page.evaluate(
    ({ store, recs }) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('vidrichka-fitness');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction(store, 'readwrite');
          for (const x of recs) tx.objectStore(store).put(x);
          tx.oncomplete = () => (r.result.close(), res(null));
        };
      }),
    { store, recs },
  );

/**
 * @param {any} page
 * @param {any} h helpers from smoke.mjs run()
 */
export async function v151(page, h) {
  const { go, settle, shot, layer, rows, clearCel, closeAll } = h;
  const idb = idbPut(page);
  const reopen = async () => {
    await page.reload();
    await page.locator('#nav .t').first().waitFor();
    await settle();
    await closeAll();
    await clearCel();
  };
  /** A tap past any prompt / sheet a timer may have opened. @param {any} l */
  const tap = async (l) => {
    for (let k = 0; k < 4; k++) {
      await closeAll();
      if (
        await l.click({ timeout: 3000 }).then(
          () => true,
          () => false,
        )
      )
        return;
    }
    throw new Error('could not tap past the prompts');
  };
  const box = async (/** @type {any} */ l) =>
    /** @type {{x: number, y: number, width: number, height: number}} */ (await l.boundingBox());
  await page.setViewportSize({ width: 360, height: 780 });
  const D = '2026-11-21';
  const T = (/** @type {string} */ day, /** @type {string} */ hm) => new Date(`${day}T${hm}:00+02:00`).getTime();
  await page.clock.setSystemTime(new Date(T(D, '20:00')));
  const kvGet = async (/** @type {string} */ id) =>
    (await rows('kv')).find((/** @type {any} */ x) => x.id === id)?.value;
  const st = (await kvGet('settings')) ?? {};
  await idb('kv', [{ id: 'settings', value: { ...st, lang: 'bg' } }]);
  await idb('days', [{ id: D, wake: T(D, '07:00'), ack: T(D, '07:00') }]);
  await reopen();
  // offline-deterministic: Open Food Facts finds nothing
  await page.route('**/*openfoodfacts.org/**', (/** @type {any} */ r) =>
    r.fulfill({ json: { count: 0, products: [] }, headers: { 'access-control-allow-origin': '*' } }),
  );

  // ---- 3a: saturated fat and sugar in the manual-food form (optional, checked against fat / carbs)
  await go('food/add/dinner');
  await page.locator('#fq').fill('zzqx шоколад');
  await settle();
  await tap(page.locator('[data-act="manual"]').first());
  await layer.locator('#mname').waitFor();
  assert.equal(await layer.locator('#msug').getAttribute('placeholder'), 'по желание');
  assert.equal(await layer.locator('#msat').getAttribute('placeholder'), 'по желание');
  await layer.locator('#mname').fill('Шоколад тест');
  await layer.locator('#mkcal').fill('540');
  await layer.locator('#mp').fill('6');
  await layer.locator('#mc').fill('58');
  await layer.locator('#msug').fill('52');
  await layer.locator('#mf').fill('31');
  await layer.locator('#msat').fill('19');
  await layer.locator('#msat').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await shot('v151-satsug-form-360');
  await layer.locator('#msat').fill('40');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.match(await layer.locator('#e_sat').innerText(), /повече от мазнините/);
  await shot('v151-satsug-form-error-360');
  await layer.locator('#msat').fill('19');
  await layer.locator('[data-act="save"]').click();
  await settle();
  const extra2 = layer.locator('.extra2');
  // the first manual food explains the anonymous sharing once (alone with --flow v151)
  await layer.locator('.datanotice, .extra2').first().waitFor({ timeout: 6000 });
  if (await layer.locator('.datanotice').count()) await layer.locator('[data-close]').last().click();
  await extra2.waitFor({ timeout: 6000 });
  assert.match(await extra2.innerText(), /Наситени мазнини 19(,0)? г · Захар 52(,0)? г/);
  const custom = (await rows('foods')).find((/** @type {any} */ f) => f.name === 'Шоколад тест');
  assert.equal(custom?.sat, 19);
  assert.equal(custom?.sug, 52);
  await page.waitForTimeout(200);
  await shot('v151-satsug-grams-360');
  await layer.locator('[data-act="done"]').click();
  await settle();
  await closeAll();
  await go('food');
  const fs = page.locator('.fibsalt');
  await fs.waitFor();
  assert.match(await fs.innerText(), /Наситени мазнини\s*19(,0)? г/);
  assert.match(await fs.innerText(), /Захар\s*52(,0)? г/);
  const fsb = await box(fs);
  assert.ok(fsb.x + fsb.width <= 360, 'the totals fit at 360 px');
  await fs.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await shot('v151-satsug-totals-360');
  console.log('  ✔ 1.5.1 3a: saturated fat and sugar – form (checked), add sheet, Храна totals');

  // ---- 3b: herring is in the food list, with its saturated fat and sugar
  await go('food/add/dinner');
  await page.locator('#fq').fill('Херинга');
  await settle();
  const hrow = page.locator('[data-act="pick"]', { hasText: 'Херинга (сурова)' }).first();
  await hrow.waitFor({ timeout: 6000 });
  await page.waitForTimeout(200);
  await shot('v151-herring-list-360');
  await tap(hrow);
  await extra2.waitFor({ timeout: 6000 });
  assert.match(await extra2.innerText(), /Наситени мазнини 2(,0)? г · Захар 0 г/);
  await page.waitForTimeout(200);
  await shot('v151-herring-grams-360');
  await closeAll();
  console.log('  ✔ 1.5.1 3b: herring in the list (sat 2 g, sugar 0 g per 100 g)');

  // ---- 4a: Начало – mood / energy and water between „Сън снощи“ and „Хранене днес“
  await idb('days', [{ id: D, wake: T(D, '07:00'), ack: T(D, '07:00'), mood: 4, energy: 3 }]);
  await idb('food', [{ id: `water_${D}`, type: 'water', date: D, glasses: 2 }]);
  await reopen();
  await go('home');
  const sleep = page.locator('.content .sleepcard'),
    mood = page.locator('.content .moodcard'),
    water = page.locator('.content .water'),
    meals = page.locator('.content .homemeals');
  await mood.waitFor();
  const ys = [];
  for (const l of [sleep, mood, water, meals]) ys.push((await box(l)).y);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2] && ys[2] < ys[3], `order sleep < mood < water < meals (${ys})`);
  assert.match(await mood.innerText(), /Настроение[\s\S]*Енергия/);
  assert.match(await water.locator('.wateramt').innerText(), /^2/);
  await tap(water.locator('.waterplus'));
  await settle();
  assert.match(await page.locator('.content .water .wateramt').innerText(), /^3/, 'a glass from Начало');
  assert.equal((await rows('food')).find((/** @type {any} */ x) => x.id === `water_${D}`)?.glasses, 3);
  await page.locator('.content .sleepcard').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, -70));
  await page.waitForTimeout(2500); // the glass / otter animation is over
  await shot('v151-home-mood-water-360');
  await tap(page.locator('.content .moodcard'));
  await layer.locator('h2', { hasText: 'Настроение и енергия' }).waitFor();
  await closeAll();
  console.log('  ✔ 1.5.1 4a: Начало – sleep, mood / energy, water, meals; water and mood work there');

  // ---- 4b: a „Часове сън“ bar opens that night's sleep editor (empty night filled in; rules kept)
  const P = '2026-11-19',
    Q = '2026-11-18';
  await idb('food', [
    {
      id: 'bfQ',
      date: Q,
      meal: 'breakfast',
      ts: T(Q, '07:10'),
      time: '07:10',
      name: 'Яйца',
      grams: 100,
      kcal: 140,
      p: 12,
      c: 1,
      f: 10,
    },
  ]);
  await reopen();
  await go('progress/sleep');
  const bars = page.locator('.sbars .sb');
  await bars.first().waitFor();
  assert.equal(await bars.count(), 14);
  const bar = page.locator(`.sbars .sb[data-d="${P}"]`);
  assert.equal(await bar.evaluate((e) => e.tagName), 'BUTTON');
  const hBefore = await bar.locator('i').evaluate((e) => e.getBoundingClientRect().height);
  await page.locator('.sbars').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await shot('v151-sleepbar-before-360');
  await tap(bar);
  await layer.locator('.sleeptimes').waitFor();
  const bed = layer.locator('.sbed input.t24i'),
    wake = layer.locator('.swake input.t24i');
  await bed.fill('23:30');
  await bed.blur();
  await wake.fill('07:00');
  await wake.blur();
  await settle();
  assert.match(await layer.locator('.sleepdur').innerText(), /^7 ч 30 мин$/);
  await page.waitForTimeout(200);
  await shot('v151-sleepbar-editor-360');
  await layer.locator('.sleepdone').click();
  await settle();
  const dP = (await rows('days')).find((/** @type {any} */ x) => x.id === P);
  assert.equal(dP?.sleepWake, T(P, '07:00'), 'saved for that day');
  const hAfter = await page.locator(`.sbars .sb[data-d="${P}"] i`).evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(hAfter > hBefore + 10, `the bar grew (${hBefore} → ${hAfter})`);
  await page.locator('.sbars').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await shot('v151-sleepbar-after-360');
  // a past day with breakfast at 07:10: a later wake-up is refused, like today
  await tap(page.locator(`.sbars .sb[data-d="${Q}"]`));
  await layer.locator('.sleeptimes').waitFor();
  await layer.locator('.sbed input.t24i').fill('23:00');
  await layer.locator('.sbed input.t24i').blur();
  await layer.locator('.swake input.t24i').fill('07:30');
  await layer.locator('.swake input.t24i').blur();
  await settle();
  assert.match(await layer.locator('.sleeperr').innerText(), /Закуската е записана в 07:10/);
  assert.ok(await layer.locator('.sleepdone').isDisabled());
  // more than 16 h stays refused
  await layer.locator('.sbed input.t24i').fill('12:00');
  await layer.locator('.sbed input.t24i').blur();
  await layer.locator('.swake input.t24i').fill('06:40');
  await layer.locator('.swake input.t24i').blur();
  await settle();
  assert.match(await layer.locator('.sleeperr').innerText(), /Сънят трябва да е до 16 ч/);
  await closeAll();
  assert.equal(
    (await rows('days')).find((/** @type {any} */ x) => x.id === Q)?.sleepWake ?? null,
    null,
    'nothing saved',
  );
  console.log('  ✔ 1.5.1 4b: a sleep bar opens that night’s editor – filled in; breakfast rule and 16 h cap kept');
  await go('home');
}
