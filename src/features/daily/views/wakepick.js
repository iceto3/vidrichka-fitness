/**
 * 1.6.4: the „Събудих се“ time picker (default = now, confirm). Sleep hours, breakfast
 * timing and the protein countdown follow the chosen time, not the tap.
 * @module features/daily/views/wakepick
 */
import { emit } from '../../../core/bus.js';
import { dayKey, hhmm } from '../../../core/dates.js';
import { t } from '../../../core/i18n.js';
import { toast } from '../../../ui/sheet.js';
import { openWheelPicker } from '../../../ui/wheel.js';
import { checkWakeTime, wakeConflict, wakeFloor, wakeUp } from '../api.js';

const ERR = {
  future: 'day.err.wakeFuture',
  early: 'day.err.wakeBeforeBed',
  breakfast: 'day.err.wakeAfterBreakfast',
  invalid: 'time24.bad',
};

/**
 * Open the wake-up wheel (default now). On confirm, records the wake-up and goes to
 * #morning (or refreshes it). @param {number} [now]
 * @returns {void}
 */
export function openWakePicker(now = Date.now()) {
  const floor = wakeFloor(now);
  const min = floor != null && dayKey(floor) === dayKey(now) ? hhmm(floor) : undefined;
  openWheelPicker({
    mode: 'time',
    value: hhmm(now),
    min,
    max: hhmm(now),
    step: 1,
    title: t('morning.wakeTitle'),
    hint: t('morning.wakeHint'),
    onConfirm: (hm) => {
      const r = checkWakeTime(hm, now);
      if (r.ok === false) {
        toast(t(ERR[r.err] ?? ERR.invalid, r.at != null ? { time: hhmm(new Date(r.at)) } : {}));
        return false;
      }
      if (!wakeUp(r.at)) {
        const bf = wakeConflict(dayKey(now), r.at);
        if (bf != null) toast(t('day.err.wakeAfterBreakfast', { time: hhmm(new Date(bf)) }));
        return false;
      }
      emit('nav', { path: 'morning' });
    },
  });
}
