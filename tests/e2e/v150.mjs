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

  await page.setViewportSize(vp ?? { width: 390, height: 844 });
}
