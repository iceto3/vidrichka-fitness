/**
 * User settings with defaults. Stored as one kv entry; unknown/missing keys always fall
 * back to DEFAULTS, so adding a new setting never needs a migration.
 * @module core/settings
 */
import { kv, setKv } from './store.js';
import { emit } from './bus.js';

/** @typedef {typeof DEFAULTS} Settings */
export const DEFAULTS = {
  lang: '',            // '' = detect from the device on first run
  theme: 'auto',       // 'light' | 'dark' | 'auto'
  userName: '',
  otterName: '',       // '' = localized default ("Vidrichka" / "Видричка")
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
  partnerName: '',
  outfit: 'auto',
  onboarded: false,
  lastBackup: 0,
};

/** Current settings merged over defaults. @returns {Settings} */
export const settings = () => ({ ...DEFAULTS, ...kv('settings', {}) });

/**
 * Update one or more settings.
 * @param {Partial<Settings>} patch
 */
export function setSettings(patch) {
  setKv('settings', { ...kv('settings', {}), ...patch });
  emit('settings:changed', patch);
}
