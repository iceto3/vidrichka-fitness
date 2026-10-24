/**
 * Exercise picker sheet used by the plan editor.
 * @module features/library/views/picker
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { exRow, filterActions, filtered, filters } from './list.js';

/**
 * Open the picker.
 * @param {(exId: string) => void} onPick
 */
export function openPicker(onPick) {
  openSheet({
    render: () => String(html`<h2 class="h2">${t('editor.addExercise')}</h2><div class="mt12">${filters()}</div>
<div class="list mt12">${filtered().map((e) => exRow(e, `data-act="pick" data-id="${e.id}"`, ic('plus', 20, 2.6, 'var(--accent-d)')))}</div>`),
    actions: { ...filterActions, pick: (el) => (closeSheet(), onPick(el.dataset.id ?? '')) },
  });
}
