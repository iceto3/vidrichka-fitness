/**
 * 1.4.3 Meal-reminder pill: a small brown pill just above the bottom nav on every tab except
 * Начало (which has the big banner). It shows the pending meal and the banner's countdown
 * (`pendingMeal` → `proteinBar`, no second timer logic) and opens the meal sheet with
 * „Изядох“ / „Пропуснах“ (the banner's own actions, see views/mealsheet.js).
 * 1.4.3 (part A): it always stays full size (no shrinking on scroll). Hidden when
 * nothing is pending, once the meal is answered, during a workout and on pages without the
 * nav. While it shows, `body.has-mpill` adds room under the page so it never covers content.
 * @module features/daily/pill
 */
import { esc } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { on } from '../../core/bus.js';
import { currentPath, currentView } from '../../core/router.js';
import { ic } from '../../ui/icons.js';
import { activeWorkout } from '../workouts/api.js';
import { pillVisible } from './mealtime.js';
import { countdownParts, mealNow, openMealSheet } from './views/mealsheet.js';

/** Create the pill once and keep it in sync (every second and on page/data changes). */
export function startMealPill() {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'mealpill';
  el.className = 'mealpill';
  el.hidden = true;
  document.body.append(el);
  el.addEventListener('click', () => openMealSheet('ask'));
  let key = '';

  const update = () => {
    const m = mealNow();
    const view = currentView();
    const show = pillVisible({
      pending: m,
      tab: view?.tab,
      navHidden: !!view?.hideNav,
      workout: !!activeWorkout(),
      path: currentPath(),
    });
    document.body.classList.toggle('has-mpill', show);
    if (!show || !m) {
      el.hidden = true;
      key = '';
      return;
    }
    const name = t(`meal.${m.meal}`);
    const [pre, post] = countdownParts(m.mode);
    el.setAttribute('aria-label', `${name}: ${pre}${m.time}${post}`);
    const k = `${m.meal}|${m.mode}|${name}`;
    if (k !== key) {
      // rebuilt only when the meal, its state or the language changes; the time ticks in place
      key = k;
      el.className = `mealpill ${m.mode}`;
      el.innerHTML = `<span class="mpic" aria-hidden="true">${ic('clock', 18, 2.4)}</span><span class="mptx" aria-hidden="true"><span class="mpname">${esc(name)}</span><span class="ptime num">${esc(m.time)}</span></span>`;
    }
    const tm = el.querySelector('.ptime');
    if (tm && tm.textContent !== m.time) tm.textContent = m.time;
    el.hidden = false;
  };

  on('route:changed', update);
  on('store:any', () => setTimeout(update, 0));
  on('settings:changed', () => ((key = ''), setTimeout(update, 0)));
  setInterval(update, 1000);
  update();
}
