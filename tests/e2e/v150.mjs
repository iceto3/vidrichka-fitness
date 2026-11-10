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

  // ---- 2b + 2a: the clock in the food picker; one time per meal
  const D = '2026-11-20';
  const T = (/** @type {string} */ hm) => new Date(`${D}T${hm}:00+02:00`).getTime();
  await page.clock.setSystemTime(new Date(T('13:00')));
  await idb('days', [{ id: D, wake: T('07:00'), ack: T('07:00') }]);
  await reopen();
  await go('food/add/lunch');
  const ck = page.locator('.mealclock .t24i');
  await ck.waitFor();
  assert.equal(await ck.inputValue(), '13:00', 'default: now');
  await page.locator('.mealclock .t24b[data-d="-5"]').click();
  await settle();
  await page.locator('.mealclock .t24b[data-d="-5"]').click();
  await settle();
  assert.equal(await ck.inputValue(), '12:50');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(200);
  await shot('v150-picker-clock');
  for (const [hm, re] of [
    ['13:30', /още не е дошъл/],
    ['06:50', /преди ставането/],
  ]) {
    await ck.fill(hm);
    await ck.press('Tab');
    await settle();
    assert.match(await page.locator('.clockerr').innerText(), re, hm);
  }
  await ck.fill('12:30');
  await ck.press('Tab');
  await settle();
  assert.equal(await page.locator('.clockerr').count(), 0);
  const addOne = async (/** @type {number} */ i) => {
    await h.clickPast(page.locator('.cats .cat[data-act="cat"]').nth(i), layer.locator('.flist'));
    await layer.locator('.flist [data-act="pick"]').first().click();
    await layer.locator('#grams').waitFor();
    await layer.locator('[data-act="done"]').click();
    await settle();
  };
  await addOne(0);
  await page.clock.setSystemTime(new Date(T('13:04')));
  await addOne(1);
  const lunch = async () =>
    (await rows('food'))
      .filter((/** @type {any} */ r) => r.date === D && r.meal === 'lunch')
      .map((/** @type {any} */ r) => r.time);
  assert.deepEqual(await lunch(), ['12:30', '12:30'], 'both at the clock time');
  await page.locator('[data-act="finish"]').first().click();
  await settle();
  await closeAll();
  // 2a: the item editor's „Час“ on one entry moves the whole meal
  await go('food');
  await h.clickPast(page.locator('.meal[data-m="lunch"]'), layer.locator('.mealitems'));
  await layer.locator('.mealitems .itembtn').nth(1).click();
  const it = layer.locator('.itemedit .itemtime input.t24i');
  await it.waitFor();
  assert.match(await layer.locator('.itemedit').innerText(), /важи за цялото хранене/);
  await it.fill('12:45');
  await it.press('Tab');
  await settle();
  await layer.locator('.itemedit [data-act="save"]').click();
  await settle();
  assert.deepEqual(await lunch(), ['12:45', '12:45'], 'the whole meal moved');
  await h.clickPast(page.locator('.meal[data-m="lunch"]'), layer.locator('.mealitems'));
  assert.equal((await layer.locator('.mealitems').innerText()).match(/12:45/g)?.length, 2);
  await page.waitForTimeout(400);
  await shot('v150-meal-time-moved');
  await closeAll();
  console.log('  ✔ 1.5.0 2a/2b: clock in the picker (default now, ±5, no future, not before wake), one time per meal');

  // ---- 2c: „Добави хранене“ (Начало + Храна) → an unplanned meal, named and placed by time
  await page.clock.setSystemTime(new Date(T('15:10')));
  await reopen();
  await go('food');
  assert.equal(await page.locator('.food .meals .addmeal').count(), 1, 'on Храна');
  await go('home');
  const am = page.locator('.homemeals .addmeal');
  await am.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  assert.match(await am.innerText(), /Добави хранене/);
  await page.waitForTimeout(300);
  await shot('v150-add-meal-button');
  await h.clickPast(am, page.locator('.mealclock .t24i'));
  assert.match(page.url(), /#\/food\/add\/x_/);
  assert.match(await page.locator('.topbar').innerText(), /Междинно следобедно/, 'now 15:10: between lunch and dinner');
  const xc = page.locator('.mealclock .t24i');
  await xc.fill('10:30');
  await xc.press('Tab');
  await settle();
  assert.match(await page.locator('.topbar').innerText(), /Междинно сутрешно/, 'the name follows the clock');
  await addOne(2);
  await page.locator('[data-act="finish"]').first().click();
  await settle();
  await closeAll();
  const extra = (await rows('food')).filter((/** @type {any} */ r) => r.date === D && /^x_/.test(r.meal));
  assert.equal(extra.length, 1);
  assert.equal(extra[0].time, '10:30');
  await go('home');
  const hm = page.locator('.homemeals');
  const names = await hm.locator('.meal .b').allInnerTexts();
  const iEx = names.findIndex((n) => /Междинно сутрешно/.test(n));
  assert.ok(
    iEx > names.findIndex((n) => /Закуска/.test(n)) && iEx < names.findIndex((n) => /Обяд/.test(n)),
    names.join(' | '),
  );
  const xp = (await kvGet('xp')) ?? {};
  assert.equal(Object.keys(xp).filter((k) => k.includes('x_')).length, 0, 'no XP for an unplanned meal');
  await hm.locator('.meal', { hasText: 'Междинно сутрешно' }).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('v150-extra-meal-logged');
  console.log(
    '  ✔ 1.5.0 2c: „Добави хранене“ on Начало + Храна, „Междинно сутрешно“ by time, placed among the meals, no XP',
  );

  await page.setViewportSize(vp ?? { width: 390, height: 844 });
}
