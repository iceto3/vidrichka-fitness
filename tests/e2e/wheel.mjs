/**
 * 1.6.4 e2e helpers: read and set times/dates through the scroll-wheel picker
 * (no keyboard, no native date/time inputs).
 * @module tests/e2e/wheel
 */

/**
 * Current "HH:MM" / "YYYY-MM-DD" / "H:MM" value of a wheel-backed field.
 * @param {import('playwright-core').Locator} loc
 */
export const timeVal = (loc) =>
  loc.evaluate((e) => /** @type {any} */ (e).value || e.getAttribute('value') || (e.textContent ?? '').trim());

/**
 * The topmost open wheel sheet.
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} [layer]
 */
export const wheelSheet = (page, layer) => (layer ?? page.locator('#layer')).locator('.wheelpick').last();

/**
 * Pick values on the open wheel and confirm.
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} [layer]
 * @param {{hour?: string|number, minute?: string|number, day?: number, month?: number, year?: number}} v
 */
export async function pickWheel(page, layer, v) {
  const pick = wheelSheet(page, layer);
  await pick.waitFor();
  /** @param {string} col @param {string|number} val */
  const col = async (col, val) => {
    const item = pick.locator(`.wcol[data-col="${col}"] .witem[data-v="${Number(val)}"]`);
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await page.waitForTimeout(200);
  };
  if (v.year != null) await col('year', v.year);
  if (v.month != null) await col('month', v.month);
  if (v.day != null) await col('day', v.day);
  if (v.hour != null) await col('hour', v.hour);
  if (v.minute != null) await col('minute', v.minute);
  await pick.locator('[data-act="ok"]').click();
  await pick.waitFor({ state: 'hidden', timeout: 4000 }).catch(async () => {
    await pick.waitFor({ state: 'detached', timeout: 4000 });
  });
}

/**
 * Open a time field and set "HH:MM".
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} loc
 * @param {string} hm
 * @param {import('playwright-core').Locator} [layer]
 */
export async function setTime(page, loc, hm, layer) {
  const [h, m] = hm.split(':');
  await loc.click();
  await pickWheel(page, layer, { hour: h, minute: m });
}

/**
 * Open a date field and set "YYYY-MM-DD".
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} loc
 * @param {string} iso
 * @param {import('playwright-core').Locator} [layer]
 */
export async function setDate(page, loc, iso, layer) {
  const [y, mo, d] = iso.split('-').map(Number);
  await loc.click();
  await pickWheel(page, layer, { year: y, month: mo, day: d });
}

/**
 * Confirm the open wheel with its current (default) value — the one-tap „сега“ path.
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} [layer]
 */
export async function confirmWheel(page, layer) {
  const pick = wheelSheet(page, layer);
  await pick.waitFor();
  await pick.locator('[data-act="ok"]').click();
  await pick.waitFor({ state: 'hidden', timeout: 4000 }).catch(async () => {
    await pick.waitFor({ state: 'detached', timeout: 4000 });
  });
}
