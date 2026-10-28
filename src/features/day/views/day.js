/**
 * 1.4.0 Day view (`#day/<YYYY-MM-DD>`): everything recorded on one day — steps, sleep,
 * mood & energy, water, food and workouts, with zeros where nothing was entered — and
 * every value editable (future days are refused). Built from the same cards as Home.
 * @module features/day/views/day
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, t } from '../../../core/i18n.js';
import { addDays, dayKey, parseDay } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { topBar } from '../../../ui/components.js';
import { canEdit } from '../api.js';
import { cardActions, mealsCard, moodCard, sleepCard, stepsCard, waterCard, workoutsCard } from './cards.js';

/** @param {string} date @returns {import('../../../core/registry.js').View} */
export default (date) => ({
  tab: 'progress',
  render: () => {
    if (!canEdit(date))
      return html`<div class="content dayview">${topBar(t('day.title'))}<p class="muted b mt16 center">${t('day.err.future')}</p></div>`;
    const d = parseDay(date),
      today = dayKey(),
      prev = dayKey(addDays(d, -1)),
      next = dayKey(addDays(d, 1));
    return html`<div class="content dayview">${topBar(date === today ? t('common.today') : t('day.title'), fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
<div class="row between mt8"><button class="iconbtn flat sm" data-act="go" data-d="${prev}" aria-label="${t('food.prevDay')}">${ic('left', 18)}</button>
<span class="muted xs b center f1">${t('day.editHint')}</span>
<button class="iconbtn flat sm" data-act="go" data-d="${next}" aria-label="${t('food.nextDay')}" ${next > today ? raw('disabled') : ''}>${ic('right', 18)}</button></div>
${stepsCard(date)}${sleepCard(date)}${moodCard(date)}${waterCard(date)}${mealsCard(date)}${workoutsCard(date)}
<div class="h24"></div></div>`;
  },
  actions: {
    ...cardActions(() => date),
    go: (el) => (emit('nav', { path: `day/${el.dataset.d}`, replace: true }), false),
  },
});
