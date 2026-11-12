import { timeVal } from './wheel.mjs';
/**
 * 1.6.1 e2e (run from smoke.mjs after the 1.6.0 flow, or alone with `--flow v161`) at 360 px:
 * „Хранителни добавки“ in Храна (creatine row, one-tap add, „Взех“ with the protein powder
 * counted in the protein bar, undo, a reminder, an own supplement, nothing clipped) and the
 * body measurements by gender (men's / women's defaults, hide / add, kept after a gender
 * change, the form follows, back to defaults).
 */
import assert from 'node:assert/strict';

/**
 * @param {any} page
 * @param {any} h helpers from smoke.mjs run()
 */
export async function v161(page, h) {
  const { go, settle, shot, layer, rows, closeAll, dayField, clearCel } = h;
  await page.setViewportSize({ width: 360, height: 780 });
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await closeAll();

  // ——— Храна › Хранителни добавки ———
  // the supplement reminder's route: opens Храна on today (an earlier flow may have left
  // the diary on another day) at „Хранителни добавки“
  await go('food?supps');
  await settle();
  await closeAll();
  const card = page.locator('.food .supps');
  await card.waitFor();
  assert.match(await card.locator('h2').innerText(), /Хранителни добавки/);
  assert.equal(await page.locator('.food .creatinecard').count(), 1, 'creatine is the first row');
  assert.match(await card.locator('.supprow').first().innerText(), /Креатин/);
  // one tap adds a ready supplement
  await card.locator('.suppnew').click();
  await layer.locator('.supppick[data-k="protein"]').click();
  await settle();
  await layer.locator('.supppick[data-k="vitd"]').click();
  await settle();
  assert.equal(await layer.locator('.supppick[data-k="protein"]').count(), 0, 'added once');
  await closeAll();
  const row = (/** @type {string} */ id) => card.locator(`.supprow[data-supp="${id}"]`);
  assert.match(await row('protein').innerText(), /Протеин на прах/);
  assert.match(await row('vitd').innerText(), /Витамин D/);
  // „Взех“ with the last dose; protein powder counts in the protein bar
  const protein = async () =>
    Number(
      (await page.locator('.food .macro').first().locator('.muted.num').innerText()).split('/')[0].replace(/\D/g, ''),
    );
  const p0 = await protein();
  await row('protein').locator('.supptake').click();
  await settle();
  assert.equal(await dayField('sp_protein'), 30);
  assert.equal(await dayField('suppP'), 22.5);
  assert.equal(await row('protein').locator('.supptake').getAttribute('aria-pressed'), 'true');
  // 1.6.2 (tester): the streak is visible from day 1
  assert.equal((await row('protein').locator('.suppstreak').innerText()).trim(), '🔥 1 ден подред');
  assert.match(await row('vitd').locator('.suppstreak').innerText(), /0 дни подред/);
  const p1 = await protein();
  assert.ok(Math.abs(p1 - p0 - 22.5) <= 1, `protein bar ${p0} → ${p1}`);
  // untick → „Отмени“ puts it back
  await row('protein').locator('.supptake').click();
  await settle();
  assert.equal(await dayField('sp_protein'), null);
  const pill = page.locator('.undopill');
  assert.equal((await pill.innerText()).trim(), 'Отмени');
  await pill.click();
  await settle();
  assert.equal(await dayField('sp_protein'), 30, 'Отмени ticks it again');
  // reminder at a chosen time + a dose for the day
  await row('vitd').locator('.suppedit').click();
  await layer.locator('[data-act="suppRemind"]').click();
  await settle();
  await layer.locator('.suppremind .t24b').last().click(); // 09:00 + 15 min
  await settle();
  assert.equal(await timeVal(layer.locator('.suppremind .t24i')), '09:15');
  await layer.locator('[data-act="suppSave"]').click();
  await settle();
  assert.equal(await dayField('sp_vitd'), 2000);
  const list = /** @type {any[]} */ (await rows('kv')).find((r) => r.id === 'supplements')?.value ?? [];
  assert.equal(list.find((/** @type {any} */ s) => s.id === 'vitd')?.remind, '09:15');
  assert.match(await row('vitd').innerText(), /🔔 09:15/);
  // an own supplement with its unit
  await card.locator('.suppnew').click();
  await layer.locator('.suppname').fill('Колаген');
  await layer.locator('.suppname').dispatchEvent('change');
  await settle();
  await layer.locator('.suppunits [data-u="g"]').click();
  await settle();
  await layer.locator('.suppdose').fill('10');
  await layer.locator('.suppdose').dispatchEvent('change');
  await layer.locator('.suppcustom').click();
  await settle();
  assert.match(await card.innerText(), /Колаген/);
  assert.match(await card.innerText(), /Доза 10 г/);
  // 360 px: nothing sticks out of the card, titles on one line
  const over = await page.evaluate(() => {
    const c = /** @type {HTMLElement} */ (document.querySelector('.food .supps')).getBoundingClientRect();
    return [...document.querySelectorAll('.food .supps *')]
      .filter((e) => {
        const q = e.getBoundingClientRect();
        return q.width && q.right > c.right + 0.5;
      })
      .map((e) => e.className);
  });
  assert.deepEqual(over, [], 'nothing clipped at 360 px');
  for (const t of await card.locator('.crtitle').all())
    assert.ok(((await t.boundingBox())?.height ?? 99) <= 24, `„${await t.innerText()}“ on one line`);
  await card.scrollIntoViewIfNeeded();
  await shot('supplements-360');
  console.log('  ✔ 1.6.1 Хранителни добавки: one-tap add, Взех, protein counted, undo, reminder, own one');

  // ——— Measurements by gender ———
  const tiles = async () => (await page.locator('.mgrid .m .n').allInnerTexts()).map((x) => x.trim());
  const gender = async (/** @type {'f'|'m'} */ g) => {
    await go('profile');
    await page.locator(`[data-act="gender"][data-v="${g}"]`).click();
    await settle();
  };
  await gender('m');
  await go('progress/body');
  await settle();
  await closeAll();
  let tl = await tiles();
  for (const n of [
    'Талия',
    'Ханш',
    'Гръдна обиколка',
    'Бедра Л / Д',
    'Прасци',
    'Мишници Л / Д',
    'Бицепс в сгъвка',
    'Рамене',
    'Врат',
    'Предмишница',
  ])
    assert.ok(tl.includes(n), `men: ${n}`);
  assert.ok(!tl.includes('Седалище') && !tl.includes('Горна част на бедрото'), 'no women-only tiles');
  // add a women's one, hide a men's one
  await page.locator('.msetup').click();
  await layer.locator('[data-act="mtile"][data-id="glutes"]').click();
  await settle();
  await layer.locator('[data-act="mtile"][data-id="neck"]').click();
  await settle();
  assert.equal(await layer.locator('[data-act="mtile"][data-id="glutes"]').getAttribute('aria-checked'), 'true');
  await shot('measure-setup-360');
  await closeAll();
  await settle();
  tl = await tiles();
  assert.ok(tl.includes('Седалище') && !tl.includes('Врат'));
  // the gender changes → the own choice stays
  await gender('f');
  await go('progress/body');
  await settle();
  await closeAll();
  const kept = await tiles();
  assert.deepEqual(kept, tl, 'kept after the gender change');
  // the form follows the shown set, with the where-to-measure cue
  await page.locator('.mgrid .addm').click();
  await layer.locator('#m_biceps').waitFor();
  assert.equal(await layer.locator('#m_neck').count(), 0);
  assert.match(await layer.locator('#h_biceps').innerText(), /бицепса/);
  assert.match(await layer.locator('#h_glutes').innerText(), /седалището/);
  await closeAll();
  // back to the defaults → the women's set
  await page.locator('.msetup').click();
  await layer.locator('[data-act="mreset"]').click();
  await settle();
  await closeAll();
  await settle();
  tl = await tiles();
  for (const n of ['Подгръдна обиколка', 'Седалище', 'Горна част на бедрото']) assert.ok(tl.includes(n), `women: ${n}`);
  assert.ok(!tl.includes('Бицепс в сгъвка') && !tl.includes('Врат'), 'no men-only tiles');
  await shot('measure-women-360');
  // 1.6.2 (tester): every tile opens a sheet with a working field + „Запази“ (Седалище first)
  const tileBtn = (/** @type {string} */ n) =>
    page.locator('.mgrid .m', { has: page.locator('.n', { hasText: n }) }).first();
  await tileBtn('Седалище').click();
  await layer.locator('#q_glutes').waitFor();
  await layer.locator('#q_glutes').fill('98');
  await layer.locator('[data-act="qsave"]').click();
  await settle();
  assert.match(await layer.locator('.list').innerText(), /98[,.]0/);
  await closeAll();
  await clearCel(); // the first measurement of the month celebrates
  for (const [n, ids] of /** @type {[string, string[]][]} */ ([
    ['Подгръдна обиколка', ['underbust']],
    ['Горна част на бедрото', ['upperThigh']],
    ['Мишници Л / Д', ['armL', 'armR']],
  ])) {
    await tileBtn(n).click();
    for (const id of ids) await layer.locator(`#q_${id}`).waitFor();
    assert.equal(await layer.locator('[data-act="qsave"]').count(), 1, `${n}: save`);
    if (ids[0] === 'armL') (await page.waitForTimeout(500), await shot('measure-tile-sheet-360'));
    await closeAll();
  }
  // the saved glutes value stays after switching gender (men: the tile stays, it has a value)
  await gender('m');
  await go('progress/body');
  await settle();
  await closeAll();
  assert.match(await tileBtn('Седалище').innerText(), /98[,.]0/);
  for (const n of ['Бицепс в сгъвка', 'Рамене', 'Врат', 'Предмишница']) {
    await tileBtn(n).click();
    await layer.locator('.mqin').first().waitFor();
    assert.equal(await layer.locator('[data-act="qsave"]').count(), 1, `${n}: save`);
    await closeAll();
  }
  await gender('f');
  console.log('  ✔ 1.6.2 every measurement tile has a field + save; glutes kept after a gender change');
  console.log('  ✔ 1.6.1 measurements by gender: defaults, hide / add, kept after a gender change, reset');
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
}
