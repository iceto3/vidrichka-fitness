/**
 * Body feature registration: the "Body" sub-tab of Progress, the monthly photo-set quest,
 * and the monthly-set bonus (XP + `photos:set` for the big celebration).
 * @module features/body
 */
import { register } from '../../core/registry.js';
import { onRestore } from '../../core/trash.js';
import { on, emit } from '../../core/bus.js';
import { all, kv } from '../../core/store.js';
import { dayKey, monthKey } from '../../core/dates.js';
import { PHOTO_DAY } from '../../data/photos.js';
import { award, XP } from '../motivation/api.js';
import { day, patchDay } from '../daily/api.js';
import { photoMonth } from './api.js';
import { monthComplete, monthOf } from './photo-logic.js';

// A photo put back from "Recently deleted" gets a free slot and its session date re-derived.
onRestore('photo', async (e) => (await import('./photos.js')).restoredPhoto(e));

register('progressTabs', { id: 'body', label: 'progress.body', order: 20, load: () => import('./views/body.js') });

/** Awarded today (so a quest done today stays visible, ticked). @param {string} month */
const setDoneToday = (month) => {
  const ts = kv('xp', {})[`photoset:${month}`]?.ts;
  return !!ts && dayKey(ts) === dayKey();
};

// Monthly 4-pose set: shown from the 1st (PHOTO_DAY) until this month's set is complete.
register('quests', {
  id: 'photos4',
  label: 'quest.photos4',
  xp: 25,
  go: 'progress/body',
  show: (/** @type {any} */ s) =>
    Number(s.today.slice(8)) >= PHOTO_DAY && (!photoMonth(s.month).done || setDoneToday(s.month)),
  done: (/** @type {any} */ s) => photoMonth(s.month).done,
  detail: (/** @type {any} */ s) => ({ n: photoMonth(s.month).poses.size, goal: 4 }),
});

/**
 * Grant the bonus for every month whose set became complete (by session date — edited dates
 * count too) and tell the daily reminder that this month is done.
 * @param {boolean} [celebrate]
 */
export function checkPhotoSets(celebrate = true) {
  const ph = all('photos');
  const months = [...new Set(ph.map((p) => monthOf(p.date)))].filter((m) => monthComplete(ph, m)).sort();
  for (const m of months)
    if (award(`photoset:${m}`, XP.photoSet) && celebrate)
      emit('photos:set', { month: m, streak: photoMonth(monthKey()).streak.current });
  const first = `${monthKey()}-${String(PHOTO_DAY).padStart(2, '0')}`,
    done = monthComplete(ph, monthKey());
  if (!!day(first).photoSet !== done) patchDay(first, { photoSet: done ? Date.now() : null });
}

let timer = 0;
on('store:photos', () => {
  clearTimeout(timer);
  timer = /** @type {any} */ (setTimeout(() => (checkPhotoSets(), emit('daily:changed')), 80));
});
on('store:replaced', () => setTimeout(() => checkPhotoSets(false), 0));
