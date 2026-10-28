/**
 * Public API of the profile feature: install help and backup status.
 * @module features/profile/api
 */
import { settings } from '../../core/settings.js';
import { all, kv } from '../../core/store.js';

export { canInstall, installApp, isIOS, isStandalone } from './install.js';

/** Days after which Home suggests a backup. */
export const BACKUP_EVERY_DAYS = 14;

/**
 * True when there is data and no backup in the last BACKUP_EVERY_DAYS days. 1.4.0: the
 * period counts from the first start (not from 1970), so a new user isn't nagged on day 1.
 * @param {number} [now]
 */
export const backupDue = (now = Date.now()) =>
  all('sessions').length + all('food').length + all('measurements').length > 3 &&
  now - (settings().lastBackup || /** @type {{createdAt?: number}} */ (kv('meta', {})).createdAt || 0) >
    BACKUP_EVERY_DAYS * 864e5;
