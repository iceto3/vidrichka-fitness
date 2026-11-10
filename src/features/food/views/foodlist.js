/**
 * 1.4.4 Food rows and lists of the add screen (search results, category sheets, Любими,
 * Ръчно добавени храни): the row with its ☆ favorite toggle and, for a custom food with a
 * package photo, a small thumbnail; lists in three groups – favorites, the 5 most used, the
 * rest – with a faint divider between the groups.
 * @module features/food/views/foodlist
 */
import { html } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { foodName, isFav, orderedFoods } from '../api.js';
import { known, safePhoto } from '../logic.js';

/**
 * Second line of a food row: kcal / 100 g, then fibre and salt when the food lists them (1.4.0).
 * @param {any} f
 */
export const foodSub = (f) =>
  [
    `${fmtNum(f.kcal)} ${t('unit.kcal')} / 100 ${t('unit.g')}`,
    known(f.fib) ? `${t('food.fiberShort')} ${fmtNum(f.fib, 1)} ${t('unit.g')}` : '',
    known(f.salt) ? `${t('food.saltShort')} ${fmtNum(f.salt, 1)} ${t('unit.g')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** The food's icon: its package photo (1.4.4) or its emoji. @param {any} f @param {string} [cls] */
export const foodIcon = (f, cls = 'fic') =>
  safePhoto(f.photo)
    ? html`<span class="${cls} fphoto"><img src="${safePhoto(f.photo)}" alt="" loading="lazy" decoding="async"></span>`
    : html`<span class="${cls}">${f.emoji ?? '🍽️'}</span>`;

/**
 * One food: tap to add (`data-act="pick"`), ☆ to star it. `extra` goes before the star
 * (e.g. the edit button of a custom food).
 * @param {any} f @param {any} [extra]
 */
export const foodRow = (f, extra = '') => {
  const on = isFav(f.id);
  return html`<div class="lrow frow"><button class="fpick" data-act="pick" data-id="${f.id}">${foodIcon(f)}
<span class="f1 left minw0"><span class="b block ellip">${foodName(f)}</span><span class="muted xs b">${foodSub(f)}</span></span>${ic('plus', 18, 2.6, 'var(--accent-d)')}</button>${extra}<button class="iconbtn flat sm fstar${on ? ' on' : ''}" data-act="fav" data-id="${f.id}" aria-pressed="${String(on)}" aria-label="${t(on ? 'food.unfav' : 'food.fav', { name: foodName(f) })}">${ic('star', 19, 2.2)}</button></div>`;
};

/** A faint line between the groups. */
const divider = html`<hr class="fdiv" aria-hidden="true">`;

/**
 * Foods in the add screen's order: favorites, faint divider, the 5 most used, faint divider,
 * the rest. @param {any[]} list @param {(f: any) => any} [row]
 */
export function groupedList(list, row = (/** @type {any} */ f) => foodRow(f)) {
  const g = orderedFoods(list);
  const parts = [g.fav, g.most, g.rest].filter((p) => p.length);
  return parts.map((p, i) => html`${i ? divider : ''}${p.map(row)}`);
}
