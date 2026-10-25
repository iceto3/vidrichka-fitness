/**
 * Progress photos UI (1.2.1): the Body tab's photo section (monthly 4-pose set, every session,
 * entry points), the session editor (4 pose slots, camera/gallery per slot, "add several",
 * move, delete, editable date), the chronological timeline and the per-pose before/after.
 * Pure rules live in ../photo-logic.js; storage in ../photos.js.
 * @module features/body/views/photos
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtHM, t } from '../../../core/i18n.js';
import { dayKey, hhmm, parseDay } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { seg } from '../../../ui/components.js';
import { confirmDialog, openSheet, snack } from '../../../ui/sheet.js';
import { restore } from '../../../core/trash.js';
import { POSES, photoMonth, photoSessions, photos } from '../api.js';
import { assignSlots, beforeAfter, monthOf } from '../photo-logic.js';
import { addPhoto, deletePhoto, movePhoto, newSession, photoUrl, setSessionDate } from '../photos.js';

/** @typedef {import('../photo-logic.js').Pose} Pose @typedef {import('../photo-logic.js').Session} Session */

const SIL = raw(
  '<svg class="sil" width="44" height="64" viewBox="0 0 70 100" aria-hidden="true"><circle cx="35" cy="16" r="11" fill="currentColor"/><path d="M14 100 Q12 50 20 34 Q35 28 50 34 Q58 50 56 100Z" fill="currentColor"/></svg>',
);

/** "18 Oct" @param {string} day */
const shortDay = (day) => fmtDate(parseDay(day), { day: 'numeric', month: 'short' });
/** "18 Oct 2026" @param {string} day */
const longDay = (day) => fmtDate(parseDay(day), { day: 'numeric', month: 'short', year: 'numeric' });
/** Upload time, e.g. "Added 19 Oct, 08:05". @param {number} ts */
const addedAt = (ts) =>
  t('photo.added', { date: `${fmtDate(ts, { day: 'numeric', month: 'short' })}, ${fmtHM(hhmm(new Date(ts)))}` });
/** Month name for a `YYYY-MM` key. @param {string} m */
const monthName = (m) => fmtDate(parseDay(`${m}-01`), { month: 'long' });
/** Session date line ("18 Oct 2026 · 18:42"). @param {{date: string, time?: string}} s */
const when = (s) => `${longDay(s.date)}${s.time ? ` · ${fmtHM(s.time)}` : ''}`;

/** The current month's set as a card (poses chips, n/4, streak). */
export function monthlyCard() {
  const m = monthOf(dayKey()),
    pm = photoMonth(m),
    st = pm.streak;
  return html`<div class="card pmonth mt12${pm.done ? ' done' : ''}"><div class="row between"><div class="row gap8 xb small">${ic('camera', 18, 2.2)}${t('photo.monthly', { month: monthName(m) })}</div>
${st.current ? html`<span class="chip warm chip-sm">🔥 ${t('photo.streak', { n: st.current })}</span>` : ''}</div>
<div class="row gap6 mt10 pchips">${POSES.map((p) => html`<span class="pchip${pm.poses.has(p) ? ' on' : ''}">${pm.poses.has(p) ? ic('check', 13, 3.2) : ''}${t(`pose.${p}`)}</span>`)}</div>
<p class="muted xs b mt8">${pm.done ? t('photo.monthlyDone', { month: monthName(m) }) : html`${t('photo.posesN', { n: pm.poses.size })} · ${t('photo.monthlyHint')}`}</p></div>`;
}

/** One 4-slot grid (read-only thumbnails). @param {Session} s */
const miniSlots = (s) =>
  html`<div class="pslots mini">${POSES.map((p) => {
    const ph = s.slots[p];
    return html`<span class="pslot${ph ? '' : ' empty'}">${ph ? html`<img src="${photoUrl(/** @type {any} */ (ph))}" alt="${t(`pose.${p}`)}" loading="lazy">` : SIL}<span class="lb">${t(`pose.${p}`)}</span></span>`;
  })}</div>`;

/** The Body tab's photos section. */
export function photoSection() {
  const ss = photoSessions();
  return html`<div class="section-title"><h2 class="h3">${t('body.photos')}</h2>${ss.length ? html`<span class="muted xs b">${t('photo.sessions', { n: ss.length })}</span>` : ''}</div>
${monthlyCard()}
${
  ss.length
    ? // Every session, newest first (1.3.2: not only the latest one).
      html`<div class="psessions">${[...ss].reverse().map(
        (
          s,
        ) => html`<button class="card mt10 psession" data-act="psEdit" data-id="${s.id}"><div class="row between"><span class="xb small">${when(s)}</span><span class="muted xs b">${ic('edit', 14, 2.2)}${t('photo.edit')}</span></div>
<div class="muted xs b mt2">${addedAt(s.ts)}</div>${miniSlots(s)}</button>`,
      )}</div>`
    : html`<div class="card mt10 center pempty">${SIL}<p class="muted b small mt8 lh">${t('photo.empty')}</p></div>`
}
<button class="btn w100 mt10" data-act="psNew">${ic('camera', 20, 2.4)}${t('photo.newSession')}</button>
${ss.length ? html`<div class="row gap10 mt10"><button class="btn sec f1" data-act="psTimeline">${ic('calendar', 18, 2.2)}${t('photo.timeline')}</button><button class="btn sec f1" data-act="psCompare">${ic('copy', 18, 2.2)}${t('body.compare')}</button></div>` : ''}
<p class="muted xs b mt8">${t('body.photosPrivate')}</p>`;
}

/** Session lookup. @param {string} id @returns {Session|undefined} */
const sessionById = (id) => photoSessions().find((s) => s.id === id);

/**
 * Open the session editor. A new session starts empty with today's date; the date follows
 * the photos' capture dates (EXIF) until she sets it by hand.
 * @param {string} [id] Existing session (else a new one).
 */
export function openSession(id) {
  const sid = id ?? newSession();
  let added = 0,
    busy = false;
  /** Date she picked before the first photo (applied once a photo exists). @type {string} */
  let pendingDate = '';
  /** Photo whose "move to" row is open. @type {string} */
  let moving = '';
  emit('photos:sessionStart', sid);

  /** @param {Array<{pose: Pose, file: File}>} items */
  const save = async (items) => {
    busy = true;
    emit('ui:refresh');
    try {
      for (const it of items) (await addPhoto(sid, it.pose, it.file), added++);
      if (pendingDate) (setSessionDate(sid, { date: pendingDate }), (pendingDate = ''));
    } finally {
      busy = false;
    }
  };

  openSheet({
    kind: 'full',
    render: () => {
      const s = sessionById(sid);
      const date = s?.date ?? (pendingDate || dayKey()),
        src = s
          ? s.edited
            ? 'edited'
            : (s.photos.find((p) => p.date === p.shot?.date)?.shot?.source ?? 'upload')
          : '';
      const free = POSES.filter((p) => !s?.slots[p]).length;
      return html`<div class="row between"><h2 class="h2">${t(id ? 'photo.session' : 'photo.newSession')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<p class="muted small b mt4">${t('photo.sessionHint')}</p>
<label class="field mt12"><span>${t('photo.date')}${src === 'exif' ? html` <small class="chip chip-sm psrc">${t('photo.fromExif')}</small>` : src === 'file' ? html` <small class="chip chip-sm psrc">${t('photo.fromFile')}</small>` : src === 'edited' ? html` <small class="chip warm chip-sm psrc">${t('photo.edited')}</small>` : ''}</span>
<input class="input" type="date" id="psdate" data-change="date" value="${date}" max="${dayKey()}"><small class="hint">${t('photo.dateHint')}${s ? html` · ${addedAt(s.ts)}` : ''}</small></label>
<div class="pslots edit mt12">${POSES.map((p) => {
        const ph = s?.slots[p];
        if (!ph)
          return html`<div class="pslot empty" data-pose="${p}">${SIL}<span class="lb">${t(`pose.${p}`)}</span>
<div class="row gap6 pick"><label class="btn sm">${ic('camera', 16, 2.4)}${t('photo.camera')}<span class="sr-only"> · ${t(`pose.${p}`)}</span><input type="file" accept="image/*" capture="environment" data-change="slot" data-pose="${p}" class="sr-only"></label>
<label class="btn sm sec">${ic('upload', 16, 2.4)}${t('photo.gallery')}<span class="sr-only"> · ${t(`pose.${p}`)}</span><input type="file" accept="image/*" data-change="slot" data-pose="${p}" class="sr-only"></label></div></div>`;
        return html`<div class="pslot" data-pose="${p}"><img src="${photoUrl(/** @type {any} */ (ph))}" alt="${t(`pose.${p}`)}"><span class="lb">${t(`pose.${p}`)}</span>
<div class="row gap6 tools"><button class="iconbtn sm" data-act="mv" data-id="${ph.id}" aria-label="${t('photo.move')}" aria-expanded="${String(moving === ph.id)}">${ic('edit', 16, 2.4)}</button><button class="iconbtn sm" data-act="del" data-id="${ph.id}" aria-label="${t('photo.delete')}">${ic('trash', 16, 2.4)}</button></div>
${moving === ph.id ? html`<div class="moveto"><span class="xs xb">${t('photo.move')}</span>${POSES.filter((x) => x !== p).map((x) => html`<button class="chip chip-sm" data-act="mvTo" data-id="${ph.id}" data-v="${x}">${t(`pose.${x}`)}</button>`)}</div>` : ''}</div>`;
      })}</div>
${free ? html`<label class="btn sec w100 mt12 several">${ic('upload', 18, 2.4)}${t('photo.addSeveral')}<input type="file" accept="image/*" multiple data-change="several" class="sr-only"></label><p class="muted xs b mt4">${t('photo.addSeveralHint')}</p>` : ''}
${busy ? html`<p class="muted small b mt8 center" role="status">${t('photo.saving')}</p>` : ''}
<button class="btn w100 mt16 sticky-b" data-close>${ic('check', 20, 3)}${t('common.done')}</button>`;
    },
    actions: {
      slot: async (el) => {
        const input = /** @type {HTMLInputElement} */ (el),
          file = input.files?.[0];
        if (!file) return false;
        await save([{ pose: /** @type {Pose} */ (el.dataset.pose), file }]);
        input.value = '';
      },
      several: async (el) => {
        const input = /** @type {HTMLInputElement} */ (el),
          files = [...(input.files ?? [])];
        if (!files.length) return false;
        const slots = assignSlots(files.length, Object.keys(sessionById(sid)?.slots ?? {}));
        await save(slots.map((pose, i) => ({ pose, file: files[i] })));
        if (files.length > slots.length)
          emit('toast', { text: t('photo.tooMany', { n: files.length - slots.length }) });
        input.value = '';
      },
      date: (el) => {
        const v = /** @type {HTMLInputElement} */ (el).value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > dayKey()) return;
        if (sessionById(sid)) setSessionDate(sid, { date: v });
        else pendingDate = v;
      },
      mv: (el) => void (moving = moving === el.dataset.id ? '' : (el.dataset.id ?? '')),
      mvTo: (el) => {
        movePhoto(el.dataset.id ?? '', /** @type {Pose} */ (el.dataset.v));
        moving = '';
      },
      del: async (el) => {
        if (!(await confirmDialog({ title: t('body.deletePhotoQ'), ok: t('common.delete'), danger: true })))
          return false;
        const ph = photos().find((x) => x.id === el.dataset.id);
        const tid = ph
          ? deletePhoto(ph.id, {
              label: `${t('trash.photo')} · ${t(`pose.${ph.pose}`)}`,
              sub: fmtDate(parseDay(ph.date), { day: 'numeric', month: 'short', year: 'numeric' }),
            })
          : null;
        if (tid) snack(t('photo.deleted'), () => restore(tid));
      },
    },
    onClose: () => {
      const m = photoMonth(monthOf(dayKey()));
      // Let the store events settle first, so a full set's BIG celebration follows the small one.
      setTimeout(() => emit('photos:sessionEnd', { added, poses: m.poses.size, done: m.done }), 150);
    },
  });
}

/** All sessions in chronological order; tap one to edit it. */
export function openTimeline() {
  openSheet({
    kind: 'full',
    render: () => {
      const ss = photoSessions();
      return html`<div class="row between"><h2 class="h2">${t('photo.timeline')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
${
  ss.length
    ? html`<ol class="ptimeline mt12">${ss.map(
        (s) =>
          html`<li><button class="card psession" data-act="edit" data-id="${s.id}"><div class="row between"><span class="xb small">${when(s)}</span>${s.edited ? html`<span class="chip warm chip-sm">${t('photo.edited')}</span>` : ''}</div>
<div class="muted xs b mt2">${addedAt(s.ts)} · ${t('photo.posesN', { n: Object.keys(s.slots).length })}</div>${miniSlots(s)}</button></li>`,
      )}</ol>`
    : html`<p class="muted b mt12">${t('photo.timelineEmpty')}</p>`
}`;
    },
    actions: { edit: (el) => (openSession(el.dataset.id), false) },
  });
}

/**
 * Before/after for one pose: oldest vs newest by default, either side re-pickable, never the
 * same photo on both sides. With one photo it is "Now" and "Before" stays empty.
 * @param {Pose} [start]
 */
export function openCompare(start) {
  const has = (/** @type {Pose} */ p) => photos().some((x) => x.pose === p);
  /** @type {Pose} */
  let pose = start ?? POSES.find(has) ?? 'front';
  /** @type {string} */ let a = '',
    /** @type {string} */ b = '';
  openSheet({
    kind: 'full',
    render: () => {
      const ba = beforeAfter(photos(), pose);
      const after = ba.list.find((p) => p.id === b) ?? ba.after,
        before =
          ba.list.find((p) => p.id === a && p.id !== after?.id) ?? (ba.before?.id !== after?.id ? ba.before : null);
      const fig = (/** @type {any} */ p, /** @type {string} */ k) =>
        html`<figure class="f1${p ? '' : ' empty'}">${p ? html`<img src="${photoUrl(p)}" alt="${t(k)} · ${t(`pose.${pose}`)}">` : html`<div class="phold">${SIL}<span class="muted xs b">${t(ba.list.length ? 'photo.noBefore' : 'photo.noPose')}</span></div>`}<figcaption class="lb">${t(k)}${p ? ` · ${shortDay(p.date)}` : ''}</figcaption></figure>`;
      const pick = (/** @type {string} */ cur, /** @type {string} */ other, /** @type {string} */ act) =>
        html`<div class="row gap6 hscroll mt6">${ba.list.map((p) => html`<button class="thumb${p.id === cur ? ' on' : ''}" data-act="${act}" data-id="${p.id}" ${p.id === other ? 'disabled' : ''} aria-label="${shortDay(p.date)}"><img src="${photoUrl(/** @type {any} */ (p))}" alt=""></button>`)}</div>`;
      return html`<div class="row between"><h2 class="h2">${t('body.compare')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<div class="mt12">${seg(
        POSES.map((p) => ({ value: p, label: t(`pose.${p}`) })),
        pose,
        'pose',
        'seg pseg',
      )}</div>
<div class="row gap10 mt12 cmp">${fig(before, 'body.before')}${fig(after, 'body.now')}</div>
${ba.list.length > 1 ? html`<div class="xs xb muted caps mt12">${t('body.before')}</div>${pick(before?.id ?? '', after?.id ?? '', 'a')}<div class="xs xb muted caps mt10">${t('body.now')}</div>${pick(after?.id ?? '', before?.id ?? '', 'b')}` : ''}`;
    },
    actions: {
      pose: (el) => void ((pose = /** @type {Pose} */ (el.dataset.v)), (a = b = '')),
      a: (el) => void (a = el.dataset.id ?? ''),
      b: (el) => void (b = el.dataset.id ?? ''),
    },
  });
}
