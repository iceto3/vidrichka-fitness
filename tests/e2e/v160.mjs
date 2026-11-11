/**
 * 1.6.0 e2e (run from smoke.mjs after the 1.5.1 flow, or alone with `--flow v160`) at 360 px:
 * the equipment filter (пудовка / ластик) and a new exercise's coach cues and video; the two
 * home programs in Тренировки; „Ден 2 цяло тяло“ started and the Bulgarian split squat logged
 * with set 1 at 0 kg (bodyweight) and set 2 at 4 kg – saved as such and shown in the history.
 */
import assert from 'node:assert/strict';

/**
 * @param {any} page
 * @param {any} h helpers from smoke.mjs run()
 */
export async function v160(page, h) {
  const { go, settle, shot, layer, rows, clearCel, closeAll } = h;
  await page.setViewportSize({ width: 360, height: 780 });
  const T = (/** @type {string} */ day, /** @type {string} */ hm) => new Date(`${day}T${hm}:00+02:00`).getTime();
  await page.clock.setSystemTime(new Date(T('2026-11-24', '18:00'))); // a Tuesday (Ден 1 day)
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await closeAll();
  await clearCel();

  // Library: 36 exercises, the equipment filter, a new exercise's cues and the coach's video
  await go('workouts');
  await settle();
  await closeAll();
  assert.match(await page.locator('.libcard').innerText(), /62 упражнения/);
  await go('library');
  await settle();
  await closeAll();
  const chip = (/** @type {string} */ v) => page.locator(`.fchip[data-act="equip"][data-v="${v}"]`);
  assert.equal(await page.locator('.fchip[data-act="equip"]').count(), 8, 'all + 7 equipment types');
  assert.equal((await chip('kettlebell').innerText()).trim(), 'Пудовка');
  assert.equal((await chip('band').innerText()).trim(), 'Ластик');
  await chip('kettlebell').click();
  await settle();
  const names = async () => (await page.locator('.exrow .exname').allInnerTexts()).map((x) => x.trim());
  // 1.6.1: the whole kettlebell list (40, with the library exercises that can use one)
  const kb = await names();
  for (const n of [
    'Суинг с пудовка',
    'Коремна преса със сгъване на коленете',
    'Гоблет клек',
    'Турско ставане',
    'Български клек',
  ])
    assert.ok(kb.includes(n), n);
  assert.equal(kb.length, 40);
  assert.ok((await page.locator('.exrow .exthumb svg.exfb').count()) >= 2, 'equipment icon as thumbnail');
  await shot('v160-library-kettlebell-360');
  await chip('band').click();
  await settle();
  assert.equal((await names()).length, 3);
  await chip('all').click();
  await settle();
  assert.equal(await page.locator('.exrow').count(), 62);

  await go('exercise/kb_swing');
  await settle();
  assert.match(await page.locator('h1').first().innerText(), /Суинг с пудовка/);
  assert.match(await page.locator('.content').first().innerText(), /Пудовка/);
  assert.match(await page.locator('.tech').innerText(), /Съвети от треньора[\s\S]*сумо/);
  assert.equal(await page.locator('.tfigs').count(), 0, 'no drawing block for an exercise without one');
  assert.match(
    await page.locator('a.btn.yt').getAttribute('href'),
    /results\?search_query=/,
    'no coach video → search',
  );
  await go('exercise/hammer_curl');
  await settle();
  assert.match(await page.locator('a.btn.yt').getAttribute('href'), /watch\?v=QuUXhaihxBA$/);
  assert.match(await page.locator('a.btn.yt').innerText(), /Виж видеото на треньора/);
  await shot('v160-exercise-cues-360');

  // Тренировки: the two home programs (the example plans stay)
  await go('workouts');
  await settle();
  await closeAll();
  const card = (/** @type {string} */ n) => page.locator('.card.plan', { hasText: n });
  for (const n of ['Ден 1 цяло тяло', 'Ден 2 цяло тяло']) {
    assert.equal(await card(n).count(), 1, n);
    assert.match(await card(n).innerText(), /В домашни условия[\s\S]*11 упражнения/);
  }
  assert.match(await card('Ден 1 цяло тяло').innerText(), /^вт$/im);
  assert.match(await card('Ден 2 цяло тяло').innerText(), /^пт$/im);
  assert.equal(await page.locator('.card.plan', { hasText: 'Цяло тяло у дома' }).count(), 1, 'example plan kept');
  assert.equal(await page.locator('.card.plan.today', { hasText: 'Ден 1 цяло тяло' }).count(), 1, 'Tuesday');
  await shot('v160-plans-360');

  // Start „Ден 2 цяло тяло“: Bulgarian split squat with an optional kg – set 1 0 kg, set 2 4 kg
  await card('Ден 2 цяло тяло').locator('[data-act="start"]').click();
  await settle();
  if (await layer.locator('[data-act="ok"]').count()) await layer.locator('[data-act="ok"]').click(); // a workout was running
  await page.locator('.wtop').waitFor();
  await closeAll();
  const ex0 = page.locator('section.ex').first();
  assert.match(await ex0.locator('h2').innerText(), /Български клек/);
  assert.equal(await ex0.locator('.colh.bw').count(), 0, 'kg column shown for a bodyweight exercise');
  assert.match(await ex0.locator('.colh').innerText(), /Тежест/i);
  assert.match(await ex0.locator('.colh').innerText(), /Повт\.\/крак/i);
  const w = (/** @type {number} */ j) => ex0.locator(`input[data-change="w"][data-j="${j}"]`);
  assert.equal(await w(0).inputValue(), '4', 'the plan weight');
  await w(0).fill('0');
  await w(0).dispatchEvent('change');
  await settle();
  assert.equal(await w(0).inputValue(), '0', '0 kg = bodyweight');
  await ex0.locator('.done-b[data-j="0"]').click();
  await page.locator('.restbar [data-act="skip"]').click();
  await settle();
  assert.equal(await w(1).inputValue(), '0', 'the change carries to the next sets (as for any exercise)');
  await w(1).fill('4');
  await w(1).dispatchEvent('change');
  await settle();
  assert.equal(await w(1).inputValue(), '4');
  await ex0.locator('.done-b[data-j="1"]').click();
  await page.locator('.restbar [data-act="skip"]').click();
  await settle();
  // a pure bodyweight-optional exercise without weight: single-leg hip thrust shows 0 kg too
  const ex1 = page.locator('section.ex').nth(1);
  assert.match(await ex1.locator('h2').innerText(), /Хип тръст на един крак/);
  assert.equal(await ex1.locator('input[data-change="w"][data-j="0"]').inputValue(), '0');
  // the kettlebell / band exercises: kg for the kettlebell, reps only for the band
  const exBand = page.locator('section.ex', { hasText: 'Ритници назад с ластик' });
  assert.equal(await exBand.locator('.colh.bw').count(), 1, 'band: reps only');
  await shot('v160-workout-bss-360');
  await page.locator('.wtop [data-act="finish"]').click();
  await layer.locator('[data-act="ok"]').click();
  await page.locator('.summary').waitFor();
  await clearCel();
  const s = /** @type {any[]} */ (await rows('sessions'))
    .filter((x) => x.planId === 'plan_home_day2')
    .sort((a, b) => b.endedAt - a.endedAt)[0];
  assert.ok(s, 'the workout is saved');
  const bss = s.items.find((/** @type {any} */ i) => i.exId === 'bulgarian_split_squat');
  assert.deepEqual(
    bss.sets.slice(0, 2).map((/** @type {any} */ x) => [x.w, x.done]),
    [
      [0, true],
      [4, true],
    ],
  );
  assert.equal(s.items.length, 11);
  // history: kilos per set (0 kg = bodyweight, then 4 kg)
  await go(`workouts/history/${s.id}`);
  await settle();
  const hex = page.locator('.card.hex', { hasText: 'Български клек' });
  const sets = (await hex.locator('.hsets li .num').allInnerTexts()).map((x) => x.trim());
  assert.match(sets[0], /^0 кг × 12$/);
  assert.match(sets[1], /^4 кг × 12$/);
  await shot('v160-history-360');
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log('  ✔ 1.6.0: equipment filter, coach cues / video, home plans, Bulgarian split squat 0 → 4 kg');
}
