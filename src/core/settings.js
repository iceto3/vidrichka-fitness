/**
 * User settings with defaults. Stored as one kv entry; unknown/missing keys always fall
 * back to DEFAULTS, so adding a new setting never needs a migration.
 * @module core/settings
 */
import { kv, setKv } from './store.js';
import { emit } from './bus.js';

/** Default daily-rhythm reminders (times are local `HH:MM`). */
export const DAILY = {
  morning: true, // silent nudge at `wake`, loud one at `loud` unless she already woke up
  wake: '07:30',
  loud: '08:15',
  loudOn: true, // 1.4.0: the loud alarm after the silent nudge can be switched off
  protein: true, // +10/+20/+30 min reminders after waking
  water: [
    { time: '11:00', on: true },
    { time: '14:00', on: true },
    { time: '17:00', on: true },
    { time: '20:00', on: true },
  ],
  checkinAm: { time: '11:00', on: true }, // mood + sleep quality
  checkinPm: { time: '19:30', on: true }, // energy
  bedtime: { time: '22:30', on: true }, // silent "tuck her in?" nudge
  photos: { time: '10:00', on: true }, // 1.2.1: monthly 4-pose photo set, on the 1st of the month
};

/**
 * 1.4.3 (part B): the meals of the day and whether each is used. The morning snack is new and
 * off; the old „Междинно“ (`snack`) is the afternoon snack. Missing keys = these defaults.
 */
export const MEALS_ON = /** @type {Record<string, boolean>} */ ({
  breakfast: true,
  snack_am: false,
  lunch: true,
  snack: true,
  dinner: true,
});

/** Meal ids in the day's order (same as food/logic MEALS). */
export const MEAL_IDS = ['breakfast', 'snack_am', 'lunch', 'snack', 'dinner'];

/** @typedef {typeof DEFAULTS} Settings */
export const DEFAULTS = {
  lang: '', // '' = detect from the device on first run
  gender: 'f', // 1.2: grammatical gender for Bulgarian texts ('f' | 'm'); missing = 'f'
  theme: 'auto', // 'light' | 'dark' | 'auto'
  userName: '',
  otterName: '', // '' = localized default ("Vidrichka" / "Видричка")
  weeklyGoal: 3,
  kcalGoal: 1800,
  proteinGoal: 120,
  carbsGoal: 200,
  fatGoal: 60,
  waterGoal: 8,
  glassMl: 250,
  weightStep: 2.5,
  restSound: true,
  restVibrate: true,
  reminders: { enabled: false, time: '18:30', days: [0, 2, 4] }, // Mon=0
  daily: DAILY, // 1.1: morning, protein, water, check-ins, bedtime (see dailySettings)
  celebrationSounds: true,
  partnerName: '',
  outfit: 'auto',
  onboarded: false,
  lastBackup: 0,
  stepGoal: 8000, // 1.3.4: daily steps challenge (entered by hand – a web app can't read Health/Fit)
  shareFoods: true, // 1.3.4: send manually entered foods (name + per-100 g values only) anonymously
  proteinBreakfast: true, // 1.4.3: protein within 30 min of waking (countdown, pill, banner, reminders, quest, chart)
  meals: MEALS_ON, // 1.4.3 (part B): which meals of the day are used (see enabledMeals)
};

/** Current settings merged over defaults. @returns {Settings} */
export const settings = () => ({ ...DEFAULTS, ...kv('settings', {}) });

/**
 * 1.4.3: is the protein breakfast switched on (Profile)? Missing = on (existing users keep it,
 * no migration). Part B: off as well while breakfast itself is switched off. @returns {boolean}
 */
export const proteinBreakfastOn = () => settings().proteinBreakfast !== false && mealsOn().breakfast !== false;

/** 1.4.3 (part B): meal on/off map merged over the defaults. @returns {Record<string, boolean>} */
export const mealsOn = () => ({ ...MEALS_ON, ...(settings().meals ?? {}) });

/**
 * 1.4.3 (part B): the meals in use, in the day's order; never empty (all off → every meal,
 * the Profile switches keep one on). @returns {string[]}
 */
export function enabledMeals() {
  const on = mealsOn();
  const list = MEAL_IDS.filter((m) => on[m]);
  return list.length ? list : [...MEAL_IDS];
}

/** Daily-rhythm settings as stored (the Reminders editor reads and writes these). @returns {typeof DAILY} */
export const storedDailySettings = () => ({ ...DAILY, ...settings().daily });

/**
 * Daily-rhythm settings in effect, merged over DAILY so new keys get defaults. With the
 * protein breakfast switched off in Profile, `protein` reads false everywhere (countdown,
 * pill, banner, reminders, push, quest); the stored reminder choice is kept for when it is
 * switched on again. @returns {typeof DAILY}
 */
export const dailySettings = () => {
  const d = storedDailySettings();
  return proteinBreakfastOn() ? d : { ...d, protein: false };
};

/**
 * Update one or more settings.
 * @param {Partial<Settings>} patch
 */
export function setSettings(patch) {
  setKv('settings', { ...kv('settings', {}), ...patch });
  emit('settings:changed', patch);
}
