/**
 * 1.5.0 e2e (run from smoke.mjs after the 1.4.4 flows, or alone with `--flow v150`):
 * part 1 – the „Въведи“ button on one line at 360 px, the meal of the time without
 * breakfast, live kcal while typing, the steps slider; part 2 – one time per meal, the clock
 * in the food picker, „Добави хранене“ (unplanned meals).
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
export async function v150(page, h) {
  const { go, settle, shot, layer, rows, clearCel, closeAll } = h;
  const idb = idbPut(page);
  const vp = page.viewportSize();
  const reopen = async () => {
    await page.reload();
    await page.locator('#nav .t').first().waitFor();
    await settle();
    await closeAll();
    await clearCel();
  };
  const box = async (/** @type {any} */ l) =>
    /** @type {{x: number, y: number, width: number, height: number}} */ (await l.boundingBox());
  await page.setViewportSize({ width: 360, height: 780 });
  await page.clock.setSystemTime(new Date('2026-11-20T09:00:00+02:00'));
  const kvGet = async (/** @type {string} */ id) =>
    (await rows('kv')).find((/** @type {any} */ x) => x.id === id)?.value;
  const st = (await kvGet('settings')) ?? {};
  await idb('kv', [{ id: 'settings', value: { ...st, lang: 'bg' } }]);
  await reopen();

  // ---- 1a: „Въведи“ stays on one line at 360 px (Начало and the day view)
  await go('home');
  const card = page.locator('.stepscard');
  await card.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const enter = card.locator('.stepsenter');
  const eb = await box(enter),
    cb = await box(card);
  assert.ok(eb.height <= 46, `one line (${eb.height})`);
  assert.ok(eb.x + eb.width <= cb.x + cb.width + 0.5, 'inside the card');
  assert.equal(await enter.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), true, 'not clipped');
  await page.waitForTimeout(200);
  await shot('v150-steps-enter-360');
  console.log('  ✔ 1.5.0 1a: „Въведи“ on one line at 360 px');

  // ---- 1d: steps – the slider snaps every 500; −100 −50 +50 +100; never below 0
  await go('home');
  const sc = page.locator('.stepscard');
  await sc.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  assert.equal(await sc.locator('[data-n="1000"], [data-n="2000"]').count(), 0, 'no +1000 / +2000');
  assert.deepEqual(await sc.locator('.stepsfine .chip').allInnerTexts(), ['−100', '−50', '+50', '+100']);
  const slider = sc.locator('.stepsrange');
  assert.equal(await slider.getAttribute('step'), '500');
  const day = async () => {
    await page.waitForTimeout(150);
    return (await rows('days')).find((/** @type {any} */ r) => r.id === '2026-11-20')?.steps ?? 0;
  };
  // drag the thumb to about 40 % of the track → a multiple of 500
  const sb = await box(slider);
  await page.mouse.move(sb.x + 14, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.4, sb.y + sb.height / 2, { steps: 8 });
  await page.mouse.up();
  await settle();
  const dragged = await day();
  assert.ok(dragged > 0 && dragged % 500 === 0, `snapped to 500 (${dragged})`);
  assert.match(
    await sc.locator('.stepsn').innerText(),
    new RegExp(String(dragged).replace(/(\d)(\d{3})$/, '$1\\s?$2')),
  );
  await sc.locator('[data-n="50"]').click();
  await settle();
  assert.equal(await day(), dragged + 50);
  await sc.locator('[data-n="-100"]').click();
  await settle();
  assert.equal(await day(), dragged - 50);
  await slider.fill('0');
  await settle();
  assert.equal(await day(), 0);
  assert.ok(await sc.locator('[data-n="-100"]').isDisabled(), '− off at 0');
  await slider.fill('6500');
  await settle();
  assert.equal(await day(), 6500);
  await sc.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('v150-steps-slider-360');
  console.log('  ✔ 1.5.0 1d: steps slider (500), −100 −50 +50 +100, never below 0');

  // ---- 1c: kcal follows the amount while typing (before the field loses focus)
  await go('food/add/lunch');
  await h.clickPast(page.locator('.cats .cat[data-act="cat"]').first(), layer.locator('.flist'));
  await layer.locator('.flist [data-act="pick"]').first().click();
  const gIn = layer.locator('#grams');
  await gIn.waitFor();
  const kcal = () => layer.locator('.kcalbig').innerText();
  await gIn.click();
  await gIn.press('Control+A');
  await gIn.press('Backspace');
  await page.keyboard.type('2');
  await settle();
  const k2 = await kcal();
  await page.keyboard.type('00');
  await settle();
  const k200 = await kcal();
  assert.equal(await gIn.evaluate((e) => e === document.activeElement), true, 'still typing');
  assert.equal(await gIn.inputValue(), '200', 'the field keeps what is typed');
  assert.notEqual(k2, k200, `kcal follows the keys (${k2} → ${k200})`);
  assert.ok(parseInt(k200, 10) > parseInt(k2, 10));
  await closeAll();
  console.log('  ✔ 1.5.0 1c: kcal live while typing the amount');

  await page.setViewportSize(vp ?? { width: 390, height: 844 });
}
