/**
 * Delete with Undo, shared by every feature: rows go to "Recently deleted" and a small
 * „Отмени“ pill puts them back. Since 1.3.2 only deletions offer Undo; edits and additions
 * just show a short toast saying what happened.
 * @module ui/undo
 */
import { t } from '../core/i18n.js';
import { restore, trash } from '../core/trash.js';
import { snack } from './sheet.js';

/**
 * Delete rows into the bin and offer Undo.
 * @param {string} kind
 * @param {{store: string, row: any}[]} rows
 * @param {{label: string, sub?: string, emoji?: string, extra?: any}} meta
 * @param {string} [text] Text for screen readers / tooltip (default: „Изтрито: <label>“).
 * @param {{follow?: boolean}} [o] The same tap navigates away (see {@link snack}).
 * @returns {string} The bin entry id.
 */
export function deleteWithUndo(kind, rows, meta, text, o = {}) {
  const id = trash(kind, rows, meta);
  snack(text ?? t('undo.deleted', { name: meta.label }), () => restore(id), undefined, o);
  return id;
}
