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
};

/** Current settings merged over defaults. @returns {Settings} */
export const settings = () => ({ ...DEFAULTS, ...kv('settings', {}) });

/** Daily-rhythm settings, merged over DAILY so new keys get defaults. @returns {typeof DAILY} */
export const dailySettings = () => ({ ...DAILY, ...settings().daily });

/**
 * Update one or more settings.
 * @param {Partial<Settings>} patch
 */
export function setSettings(patch) {
  setKv('settings', { ...kv('settings', {}), ...patch });
  emit('settings:changed', patch);
}
