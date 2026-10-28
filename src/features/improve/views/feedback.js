/**
 * Feedback sheet (1.3.4, opened only from Profile): dictate with the in-app recorder (the
 * voice server's /transcribe – the text lands in the box to review) or type, attach up to 3
 * gallery screenshots (resized to ≤1080 px JPEG ≤300 KB on the phone), send.
 * @module features/improve/views/feedback
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { checkVoice, sttReady, transcribeAudio } from '../../voice/api.js';
import { MAX_REC_MS, canRecord, clock, startRecording } from '../../voice/recorder.js';
import { MAX_FB_TEXT, MAX_IMAGES } from '../logic.js';
import { prepareImage } from '../images.js';
import { feedbackLeft, sendFeedback } from '../api.js';
import { FB_PER_DAY } from '../logic.js';

export function openFeedback() {
  let text = '',
    err = '',
    busy = false,
    sent = false,
    closed = false,
    elapsed = 0,
    adding = 0;
  let recState = /** @type {'idle'|'rec'|'stt'} */ ('idle');
  /** @type {import('../../voice/recorder.js').Recording | null} */
  let recording = null;
  /** @type {{mime: string, b64: string, url: string, bytes: number}[]} */
  const images = [];
  const live = () => /** @type {HTMLElement | null} */ (document.querySelector('.fbsheet'));
  const canRec = () => canRecord() && sttReady();
  if (!sttReady()) void checkVoice().then(() => !closed && emit('ui:refresh'));

  const recognise = async (/** @type {Promise<Blob>} */ done) => {
    const audio = await done;
    if (closed) return;
    recState = 'stt';
    emit('ui:refresh');
    try {
      const said = await transcribeAudio(audio);
      if (closed) return;
      text = `${text.trim() ? `${text.trim()} ` : ''}${said}`.slice(0, MAX_FB_TEXT);
      err = '';
    } catch (e) {
      if (closed) return;
      err = t(`voice.err.${/** @type {Error} */ (e).message}`);
    }
    recState = 'idle';
    recording = null;
    emit('ui:refresh');
  };
  const sync = () => {
    const root = live();
    const n = root?.querySelector('#fbcount'),
      b = /** @type {HTMLButtonElement | null} */ (root?.querySelector('[data-act="send"]'));
    if (n) n.textContent = `${text.length}/${MAX_FB_TEXT}`;
    if (b) b.disabled = busy || recState !== 'idle' || !!adding || !text.trim();
  };

  openSheet({
    kind: 'sheet',
    onClose: () => {
      closed = true;
      recording?.cancel();
      images.forEach((i) => URL.revokeObjectURL(i.url));
    },
    render: () =>
      sent
        ? html`<div class="fbsheet fbthanks center" role="status"><div class="fbheart" aria-hidden="true">💚</div><h2 class="h2 mt8">${t('feedback.thanksTitle')}</h2>
<p class="muted small b mt6 lh">${t('feedback.thanksBody')}</p><button class="btn w100 mt16" data-act="close">${t('common.done')}</button></div>`
        : html`<div class="fbsheet"><div class="row gap10"><span class="sq acc">${ic('message', 20, 2.2)}</span><h2 class="h2 f1">${t('feedback.title')}</h2></div>
<p class="muted small b mt6 lh">${t(canRec() ? 'feedback.hintRec' : 'feedback.hint')}</p>
<label class="field vbox mt12"><textarea id="fbtext" class="bare" rows="5" maxlength="${MAX_FB_TEXT}" data-input="text" placeholder="${t('feedback.ph')}" aria-label="${t('feedback.title')}" ${busy || recState !== 'idle' ? 'disabled' : ''}>${text}</textarea></label>
${
  recState === 'rec'
    ? html`<div class="vrec row gap10 mt10" role="status"><span class="vdot" aria-hidden="true"></span><span class="b small num vtimer">${clock(elapsed)} / ${clock(MAX_REC_MS)}</span></div>`
    : ''
}
<div class="row between mt6"><span class="muted xs b">${t('feedback.privacy')}</span><span class="muted xs b num" id="fbcount">${text.length}/${MAX_FB_TEXT}</span></div>
<div class="fbimgs row gap8 mt10">${images.map(
            (im, i) =>
              html`<div class="fbimg"><img src="${im.url}" alt="${t('feedback.shot', { n: i + 1 })}"><button class="fbx" data-act="rm" data-i="${i}" aria-label="${t('feedback.remove', { n: i + 1 })}">${ic('close', 14, 3)}</button></div>`,
          )}${adding ? html`<div class="fbimg busy"><span class="spin" aria-hidden="true"></span></div>` : ''}${
            images.length + adding < MAX_IMAGES
              ? html`<label class="fbadd" tabindex="0">${ic('image', 20, 2.2)}<span class="xs b">${t('feedback.addShot')}</span><input type="file" accept="image/*" multiple data-change="pick" class="sr-only" ${busy ? 'disabled' : ''}></label>`
              : ''
          }</div>
<p class="row between mt6"><span class="muted xs b">${t('feedback.shotsHint', { n: MAX_IMAGES })}</span><span class="muted xs b num fbshots" aria-live="polite">${t('feedback.shotsCount', { n: images.length + adding, max: MAX_IMAGES })}</span></p>
${feedbackLeft() < FB_PER_DAY ? html`<p class="muted xs b mt4">${t('feedback.leftToday', { n: feedbackLeft() })}</p>` : ''}
${err ? html`<p class="verr small b mt8" role="alert">${err}</p>` : ''}
<div class="row gap10 mt14">${
            canRec()
              ? html`<button class="btn sec f1${recState === 'rec' ? ' rec' : ''}" data-act="record" aria-pressed="${String(recState === 'rec')}" ${recState === 'stt' || busy ? 'disabled' : ''}>${
                  recState === 'stt'
                    ? html`<span class="spin" aria-hidden="true"></span>${t('voice.transcribing')}`
                    : html`${ic('mic', 18, 2.4)}${recState === 'rec' ? t('voice.stop') : t('voice.record')}`
                }</button>`
              : ''
          }<button class="btn f1" data-act="send" ${busy || recState !== 'idle' || adding || !text.trim() ? 'disabled' : ''}>${
            busy
              ? html`<span class="spin" aria-hidden="true"></span>${t('feedback.sending')}`
              : html`${ic('check', 18, 3)}${t('feedback.send')}`
          }</button></div></div>`,
    actions: {
      text: (el) => {
        text = /** @type {HTMLTextAreaElement} */ (el).value.slice(0, MAX_FB_TEXT);
        sync();
        return false;
      },
      record: async () => {
        if (recState === 'stt') return false;
        if (recState === 'rec') return (recording && void recording.stop(), false);
        err = '';
        elapsed = 0;
        try {
          recording = await startRecording({
            onTick: (ms) => {
              elapsed = ms;
              const el = live()?.querySelector('.vtimer');
              if (el) el.textContent = `${clock(ms)} / ${clock(MAX_REC_MS)}`;
            },
          });
        } catch (e) {
          err = t(`voice.err.${/** @type {Error} */ (e).message}`);
          emit('ui:refresh');
          return false;
        }
        if (closed) return void recording.cancel();
        recState = 'rec';
        void recognise(recording.done);
        emit('ui:refresh');
        return false;
      },
      pick: async (el) => {
        const input = /** @type {HTMLInputElement} */ (el);
        const files = [...(input.files ?? [])].slice(0, MAX_IMAGES - images.length);
        input.value = '';
        if (!files.length) return false;
        err = '';
        adding = files.length;
        emit('ui:refresh');
        for (const f of files) {
          try {
            const im = await prepareImage(f);
            if (closed) return void URL.revokeObjectURL(im.url);
            images.push(im);
          } catch {
            err = t('feedback.errImage');
          }
          adding--;
          emit('ui:refresh');
        }
        return false;
      },
      close: () => void closeSheet(),
      rm: (el) => {
        const [im] = images.splice(Number(el.dataset.i), 1);
        if (im) URL.revokeObjectURL(im.url);
      },
      send: async () => {
        if (busy || !text.trim()) return false;
        busy = true;
        err = '';
        emit('ui:refresh');
        try {
          await sendFeedback(text, images);
          busy = false;
          sent = true;
          emit('ui:refresh');
        } catch (e) {
          busy = false;
          err = t(`feedback.err.${/** @type {Error} */ (e).message}`);
          emit('ui:refresh');
        }
        return false;
      },
    },
  });
}
