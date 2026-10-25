/**
 * Undo helpers shared by every feature: delete-with-undo (rows go to "Recently deleted" and
 * an „Отмени“ snackbar puts them back) and edit-with-undo (the previous rows are restored).
 * @module ui/undo
 */
import { t } from '../core/i18n.js';
import { put, remove } from '../core/store.js';
import { restore, trash } from '../core/trash.js';
import { snack } from './sheet.js';

/**
 * Delete rows into the bin and offer Undo.
 * @param {string} kind
 * @param {{store: string, row: any}[]} rows
 * @param {{label: string, sub?: string, emoji?: string, extra?: any}} meta
 * @param {string} [text] Snackbar text (default: „Изтрито: <label>“).
 * @returns {string} The bin entry id.
 */
export function deleteWithUndo(kind, rows, meta, text) {
  const id = trash(kind, rows, meta);
  snack(text ?? t('undo.deleted', { name: meta.label }), () => restore(id));
  return id;
}

/**
 * Offer Undo for an edit or an addition: on Undo, `before` rows are written back and rows
 * whose ids are in `added` are removed.
 * @param {string} text
 * @param {{store: string, before?: any[], added?: string[]}[]} changes
 * @param {() => void} [after] Runs after the undo (e.g. to fix derived data).
 */
export function undoEdit(text, changes, after) {
  snack(text, () => {
    for (const c of changes) {
      for (const id of c.added ?? []) remove(c.store, id);
      for (const row of c.before ?? []) put(c.store, row);
    }
    after?.();
  });
}
