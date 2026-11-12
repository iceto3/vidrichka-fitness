/**
 * 1.6.3 e2e (run from smoke.mjs after the 1.6.1 flow, or alone with `--flow v163`) at 360 px:
 * start a free workout, add a machine exercise from the library picker, log a set, finish,
 * save as a plan; the „Уред“ filter lists the four new machines and lying leg curl.
 */
import assert from 'node:assert/strict';

/**
 * @param {any} page
 * @param {any} h helpers from smoke.mjs run()
 */
export async function v163(page, h) {
  const { go, settle, shot, layer, rows, clearCel, closeAll } = h;
  await page.setViewportSize({ width: 360, height: 780 });
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await closeAll();
  await clearCel();

  // Library: „Уред“ lists the four new machines + lying leg curl
  await go('library');
  await settle();
  await closeAll();
  await page.locator('.fchip[data-act="equip"][data-v="machine"]').click();
  await settle();
  const names = async () => (await page.locator('.exrow .exname').allInnerTexts()).map((x) => x.trim());
  for (const n of [
    'Разгъване за предно бедро',
    'Коремни преси на уред',
    'Абдуктор на уред',
    'Аддуктор на уред',
    'Сгъване за задно бедро',
  ])
    assert.ok((await names()).includes(n), n);
  await shot('machines-163');

  // Тренировки → „Започни празна тренировка“
  await go('workouts');
  await settle();
  await closeAll();
  await page.locator('[data-act="startFree"]').click();
  await page.locator('.wtop').waitFor();
  assert.match(await page.locator('.wtop h1').innerText(), /Свободна тренировка/);
  assert.match(await page.locator('.freeempty').innerText(), /Още няма упражнения/);
  assert.equal((await page.locator('.addex').innerText()).trim().includes('Добави упражнение'), true);

  // Add a machine exercise from the picker (search + Уред filter)
  await page.locator('[data-act="addEx"]').click();
  await layer.locator('.exsearch input').waitFor();
  await layer.locator('.fchip[data-act="equip"][data-v="machine"]').click();
  await settle();
  await layer.locator('.exsearch input').fill('предно бедро');
  await layer.locator('.exsearch input').dispatchEvent('input');
  await settle();
  const pick = layer.locator('.exrow[data-act="pick"]');
  assert.equal(await pick.count(), 1);
  assert.match(await pick.locator('.exname').innerText(), /Разгъване за предно бедро/);
  await pick.click();
  await settle();
  await page.locator('section.ex').waitFor();
  assert.match(await page.locator('section.ex h2').innerText(), /Разгъване за предно бедро/);
  assert.equal(await page.locator('section.ex .set').count(), 3);

  // Log the first set and finish (remaining sets are dropped)
  await page.locator('.set.active .done-b.go').click();
  await settle();
  if (await page.locator('.restbar').count()) {
    await page.locator('.restbar [data-act="skip"]').click();
    await page.locator('.restbar').waitFor({ state: 'detached' });
  }
  await page.locator('.wtop [data-act="finish"]').click();
  await layer.getByRole('button', { name: /^Край$/ }).click();
  await page.locator('.summary').waitFor();
  await page.waitForTimeout(2600);
  await clearCel();
  assert.match(await page.locator('.summary').innerText(), /Свободна тренировка/);
  assert.equal(await page.locator('[data-act="savePlan"]').count(), 1);

  // Optional „Запази като план“
  await page.locator('[data-act="savePlan"]').click();
  await layer.locator('.planname').waitFor();
  await layer.locator('.planname').fill('Крака в залата');
  await layer.locator('.planname').dispatchEvent('input');
  await layer.locator('.planname').dispatchEvent('change');
  await settle();
  await layer.locator('[data-act="psave"]').click();
  await settle();
  await closeAll();
  assert.match(await page.locator('.summary').innerText(), /Запазено като план „Крака в залата“/);
  await shot('free-workout-summary-163');

  const planRows = /** @type {any[]} */ (await rows('plans'));
  const saved = planRows.find((p) => p.name === 'Крака в залата');
  assert.ok(saved, 'plan saved');
  assert.equal(saved.builtin, false);
  assert.deepEqual(saved.days, []);
  assert.equal(saved.items?.[0]?.exId, 'leg_extension');
  assert.equal(saved.items?.[0]?.sets, 1);

  await go('workouts');
  await settle();
  await closeAll();
  assert.equal(await page.locator('.plan', { hasText: 'Крака в залата' }).count(), 1);
  console.log('  ✔ 1.6.3 free workout: add a machine, log a set, finish, save as a plan');

  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
}
