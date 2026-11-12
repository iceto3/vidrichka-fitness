/**
 * 1.6.4 e2e (run from smoke.mjs after 1.6.3, or alone with `--flow v164`):
 * the brown „Събудих се“ card opens a scroll-wheel time picker defaulting to now;
 * confirm records that wake-up (sleep / breakfast follow it). The food diary date
 * opens day / month / year wheels, with no native date keyboard.
 */
import assert from 'node:assert/strict';
import { confirmWheel } from './wheel.mjs';

/**
 * @param {any} page
 * @param {any} h helpers from smoke.mjs run()
 */
export async function v164(page, h) {
  const { go, settle, shot, layer, rows, closeAll } = h;
  const D = '2026-11-27';
  const T = (/** @type {string} */ hm) => new Date(`${D}T${hm}:00+02:00`).getTime();
  /** @param {string} store @param {any[]} [recs] @param {string[]} [del] */
  const idb = (store, recs = [], del = []) =>
    page.evaluate(
      ({ store, recs, del }) =>
        new Promise((res, rej) => {
          const r = indexedDB.open('vidrichka-fitness');
          r.onerror = () => rej(r.error);
          r.onsuccess = () => {
            const tx = r.result.transaction(store, 'readwrite');
            for (const id of del) tx.objectStore(store).delete(id);
            for (const x of recs) tx.objectStore(store).put(x);
            tx.oncomplete = () => (r.result.close(), res(null));
          };
        }),
      { store, recs, del },
    );
  await page.setViewportSize({ width: 360, height: 780 });
  await page.clock.setSystemTime(new Date(T('08:20')));
  // An earlier flow (v143a) may already have recorded a wake on this day.
  const st = await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('vidrichka-fitness');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('kv', 'readonly');
          const q = tx.objectStore('kv').get('settings');
          q.onsuccess = () => (r.result.close(), res(q.result?.value ?? {}));
        };
      }),
  );
  await idb('kv', [{ id: 'settings', value: { ...st, daily: { ...st.daily, morning: true, protein: true } } }]);
  // Wipe this day and any leftover meals so confirm is not blocked by an earlier flow's breakfast.
  const foodIds = await page.evaluate(
    (d) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('vidrichka-fitness');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('food', 'readonly');
          const q = tx.objectStore('food').getAll();
          q.onsuccess = () => (r.result.close(), res((q.result ?? []).filter((x) => x.date === d).map((x) => x.id)));
        };
      }),
    D,
  );
  await idb('food', [], foodIds);
  await idb('days', [], [D]);
  await page.reload();
  await page.locator('#nav .t').first().waitFor();
  await settle();
  await closeAll();
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await closeAll();

  await go('home');
  const card = page.locator('.daycard.sunrise');
  await card.waitFor();
  assert.match(await card.innerText(), /Събудих се/);
  await card.click();
  const pick = layer.locator('.wheelpick');
  await pick.waitFor();
  assert.match(await pick.innerText(), /Събудих се/);
  await confirmWheel(page, layer);
  await page.locator('.pclock').waitFor();
  const rec = (await rows('days')).find((/** @type {any} */ r) => r.id === D);
  assert.equal(rec.wake, T('08:20'), 'wake is the confirmed time (now), not a later tap');
  assert.equal(rec.proteinStart, T('08:20'), 'breakfast timer follows the chosen wake');
  await go('home');
  await settle();
  assert.equal(await page.locator('.daycard.sunrise').count(), 0, 'card gone after the wake-up');
  await shot('wake-164');

  await go('food');
  await page.locator('.datepick').click();
  await layer.locator('.wheelpick').waitFor();
  assert.equal(await layer.locator('.wcol[data-col="day"]').count(), 1);
  assert.equal(await layer.locator('.wcol[data-col="month"]').count(), 1);
  assert.equal(await layer.locator('.wcol[data-col="year"]').count(), 1);
  assert.equal(await layer.locator('.wheelpick input').count(), 0, 'no keyboard date field');
  await confirmWheel(page, layer);
  await shot('date-wheel-164');
  console.log('  ✔ 1.6.4 Събудих се (default now) + date scroll wheels on Храна');
}
