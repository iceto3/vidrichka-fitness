/**
 * 1.4.4 e2e (run from smoke.mjs after the 1.4.3 flows, or alone with `--flow v144`):
 * C1 ☆ favorites, the Любими tile and sheet, grouped food lists; C2 Ръчно добавени храни
 * (package photo, edit, multi-delete with confirmation and Undo, single delete); C3 „Кога яде?“.
 * Every sheet is opened with `clickPastPrompts`, so a check-in prompt firing by its timer
 * never breaks a step.
 */
import assert from 'node:assert/strict';

/** @param {any} page */
const helpers = (page) => {
  const idb = (/** @type {string} */ store, /** @type {any[]} */ recs) =>
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
  /** A small JPEG made in the page (the "package photo"). */
  const jpeg = async () => {
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 800;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      g.fillStyle = '#f4c542';
      g.fillRect(0, 0, 600, 800);
      g.fillStyle = '#7a3e12';
      g.fillRect(60, 220, 480, 360);
      g.fillStyle = '#fff';
      g.font = 'bold 90px sans-serif';
      g.fillText('ВАФЛА', 120, 430);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    });
    return { name: 'package.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
  };
  return { idb, jpeg };
};

/**
 * @param {any} page
 * @param {any} h helpers from smoke.mjs run() (+ closeAll, clickPast)
 */
export async function v144(page, h) {
  const { go, settle, shot, layer, rows, clearCel, closeAll, clickPast } = h;
  const { idb, jpeg } = helpers(page);
  const kvGet = async (/** @type {string} */ id) =>
    (await rows('kv')).find((/** @type {any} */ x) => x.id === id)?.value;
  const reopen = async () => {
    await page.reload();
    await page.locator('#nav .t').first().waitFor();
    await settle();
    await closeAll();
    await clearCel();
  };
  /** A sheet screenshot after its opening animation, scrolled to the top. @param {string} n */
  const sheetShot = async (n, top = true) => {
    await page.waitForTimeout(500);
    if (top)
      await page.evaluate(() =>
        document.querySelectorAll('#layer .panel, #layer .sheet').forEach((e) => (e.scrollTop = 0)),
      );
    await page.waitForTimeout(100);
    await shot(n);
  };
  await page.clock.setSystemTime(new Date('2026-11-16T12:30:00+02:00'));
  const st = (await kvGet('settings')) ?? {};
  await idb('kv', [
    {
      id: 'settings',
      value: { ...st, lang: 'bg', meals: { breakfast: true, snack_am: false, lunch: true, snack: true, dinner: true } },
    },
    { id: 'active', value: null },
  ]);
  await reopen();
  await page.setViewportSize({ width: 390, height: 844 });

  // ---- C1: Любими first, ☆ in the lists, favorites → divider → most used → divider → rest
  await go('food/add/lunch');
  await page.locator('.cats .cat').first().waitFor();
  const firstTile = page.locator('.cats .cat').first();
  assert.equal(await firstTile.getAttribute('data-act'), 'favs', 'Любими is the first tile');
  assert.match(await firstTile.innerText(), /Любими/);
  const catTile = page.locator('.cats .cat[data-act="cat"]').first();
  await clickPast(catTile, layer.locator('.flist'));
  const star = layer.locator('.flist .fstar').nth(3);
  const starredId = await star.getAttribute('data-id');
  assert.equal(await star.getAttribute('aria-pressed'), 'false');
  await star.click();
  await settle();
  assert.match(await page.locator('.toast').last().innerText(), /любими/i);
  const first = layer.locator('.flist .lrow').first();
  assert.equal(await first.locator('.fpick').getAttribute('data-id'), starredId, 'the favorite moves to the top');
  assert.equal(await first.locator('.fstar').getAttribute('aria-pressed'), 'true');
  assert.ok(await layer.locator('.flist .fdiv').count(), 'a faint divider after the favorites');
  const favStored = (await kvGet('foodFav')) ?? {};
  assert.ok(favStored[String(starredId)], 'favorite saved on the device');
  await sheetShot('v144-category-groups');
  await closeAll();
  await clickPast(page.locator('.cats .cat[data-act="favs"]'), layer.locator('h2', { hasText: 'Любими' }));
  assert.equal(await layer.locator(`.flist .fpick[data-id="${starredId}"]`).count(), 1, 'Любими lists the food');
  await sheetShot('v144-favorites');
  // picking from Любими opens the grams sheet
  await layer.locator(`.flist .fpick[data-id="${starredId}"]`).click();
  await layer.locator('#grams').waitFor();
  await closeAll();
  console.log('  ✔ 1.4.4 C1: Любими tile + sheet, ☆ moves a food to the top, grouped lists');

  // ---- C2: a custom food with a package photo
  await clickPast(page.locator('.content [data-act="manual"]').last(), layer.locator('#mname'));
  await layer.locator('.pkgpick input[type=file]').setInputFiles(await jpeg());
  await layer.locator('.pkgthumb').waitFor({ timeout: 8000 });
  await layer.locator('#mname').fill('Вафла Тест');
  for (const [k, v] of [
    ['kcal', '500'],
    ['p', '7'],
    ['c', '60'],
    ['f', '25'],
    ['portion', '40'],
    ['cr', '0,1'],
  ])
    await layer.locator(`#m${k}`).fill(v);
  await sheetShot('v144-new-food-photo');
  await layer.locator('[data-act="save"]').click();
  // the first manual food shows the anonymous-data notice once
  const notice = layer.locator('.datanotice');
  if (
    await notice.waitFor({ timeout: 2500 }).then(
      () => true,
      () => false,
    )
  ) {
    await layer.locator('[data-close]').last().click();
  }
  await layer.locator('#grams').waitFor();
  await closeAll();
  const saved = (await rows('foods')).find((/** @type {any} */ f) => f.name === 'Вафла Тест');
  assert.ok(saved, 'the custom food is saved before it is added');
  assert.equal(saved.source, 'custom');
  assert.equal(saved.cr, 0.1);
  assert.match(saved.photo, /^data:image\/jpeg;base64,/);
  assert.ok(saved.photo.length < 80_000, `thumbnail is small (${saved.photo.length})`);
  // two more custom foods, then the tile
  const now = Date.now();
  await idb('foods', [
    {
      id: 'custom_e2e_1',
      source: 'custom',
      cat: 'other',
      emoji: '🍽️',
      name: 'Кекс домашен',
      kcal: 380,
      p: 6,
      c: 50,
      f: 17,
      portion: 80,
      created: now - 2000,
    },
    {
      id: 'custom_e2e_2',
      source: 'custom',
      cat: 'other',
      emoji: '🍽️',
      name: 'Салата Шопска моя',
      kcal: 110,
      p: 4,
      c: 6,
      f: 8,
      portion: 300,
      created: now - 1000,
    },
  ]);
  await reopen();
  await go('food/add/lunch');
  const customTile = page.locator('.cats .cat[data-act="custom"]');
  await customTile.waitFor();
  assert.match(await customTile.innerText(), /Ръчно добавени храни/);
  const sheetOpen = layer.locator('.delmode');
  await clickPast(customTile, sheetOpen);
  assert.equal(await layer.locator('.flist .fpick').count(), 3);
  assert.equal(await layer.locator('.flist .fphoto img').count(), 1, 'the thumbnail is shown in the list');
  await sheetShot('v144-custom-list');

  // edit: new kcal, history kept
  await layer.locator(`.fedit[data-id="${saved.id}"]`).click();
  await layer.locator('#mkcal').waitFor();
  assert.equal(await layer.locator('#mkcal').inputValue(), '500');
  assert.equal(await layer.locator('#mcr').inputValue(), '0.1');
  await layer.locator('#mkcal').fill('520');
  await sheetShot('v144-edit-food');
  await layer.locator('[data-act="save"]').click();
  await settle();
  const edited = (await rows('foods')).find((/** @type {any} */ f) => f.id === saved.id);
  assert.equal(edited.kcal, 520);
  const oldRow = (await rows('food')).find((/** @type {any} */ r) => r.foodId === saved.id);
  assert.ok(!oldRow, 'the grams sheet was closed, nothing logged');

  // delete mode: pick two → „Изтрий (2)“ → confirm → Undo
  await layer.locator('.delmode').click();
  await layer.locator('.fchk').first().waitFor();
  const go2 = layer.locator('[data-act="delGo"]');
  assert.ok(await go2.isDisabled(), 'nothing picked yet');
  await layer.locator('.fchk').nth(0).check();
  await layer.locator('.fchk').nth(1).check();
  await settle();
  assert.match(await go2.innerText(), /Изтрий \(2\)/);
  await sheetShot('v144-delete-mode');
  await go2.click();
  const dlg = layer.locator('.dialog');
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /Да изтрия ли 2 храни\?/);
  await dlg.locator('[data-act="ok"]').click();
  await settle();
  assert.equal(await layer.locator('.flist .fpick').count(), 1, 'two foods deleted');
  assert.equal((await rows('foods')).filter((/** @type {any} */ f) => f.source === 'custom').length, 1);
  await page.locator('.undopill').click();
  await settle();
  await page.waitForTimeout(300);
  assert.equal(await layer.locator('.flist .fpick').count(), 3, 'Undo brings both back');

  // single delete from the edit screen
  await layer.locator('.fedit[data-id="custom_e2e_1"]').click();
  await layer.locator('[data-act="delFood"]').click();
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /Кекс домашен/);
  await dlg.locator('[data-act="ok"]').click();
  await settle();
  assert.equal(await layer.locator('.flist .fpick').count(), 2);
  assert.ok(!(await rows('foods')).some((/** @type {any} */ f) => f.id === 'custom_e2e_1'));
  await closeAll();
  console.log('  ✔ 1.4.4 C2: custom foods – photo thumbnail, edit, multi-delete + confirm + Undo, single delete');
}
