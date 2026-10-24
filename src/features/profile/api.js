/**
 * Public API of the profile feature: install help and backup status.
 * @module features/profile/api
 */
import { settings } from '../../core/settings.js';
import { all } from '../../core/store.js';

export { canInstall, installApp, isIOS, isStandalone } from './install.js';

/** Days after which Home suggests a backup. */
export const BACKUP_EVERY_DAYS = 14;

/** True when there is data and no backup in the last BACKUP_EVERY_DAYS days. */
export const backupDue = () =>
  all('sessions').length + all('food').length + all('measurements').length > 3 &&
  Date.now() - (settings().lastBackup || 0) > BACKUP_EVERY_DAYS * 864e5;
