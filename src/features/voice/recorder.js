/**
 * In-app voice recording (1.3.3) for phones without working browser speech recognition
 * (iPhone Safari / PWA, desktop, other browsers): MediaRecorder at 32 kbps mono, preferring
 * audio/mp4 (iOS) and falling back to webm/opus, with a level meter, a timer and an
 * automatic stop at 30 s. The microphone is released as soon as recording ends. The audio
 * stays in memory and is only sent to the voice server for transcription.
 * @module features/voice/recorder
 */

/** Longest recording, ms. */
export const MAX_REC_MS = 30_000;
/** Bit rate asked from MediaRecorder. */
export const BITRATE = 32_000;
/** Container preference: mp4/AAC first (iPhone), then webm/opus (Android, desktop). */
export const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/**
 * True on Chrome for Android, the one place the browser's own speech recognition works well
 * (it keeps its „Диктувай“ button there; everywhere else the app records itself).
 * @param {string} [ua]
 */
export const isAndroidChrome = (ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) =>
  /Android/i.test(ua) && /Chrome\/\d/.test(ua) && !/SamsungBrowser|Firefox|FxiOS|OPR\/|EdgA|YaBrowser/i.test(ua);

/** @returns {any} */
const MR = () => /** @type {any} */ (globalThis).MediaRecorder;

/** True when this browser can record audio. */
export const canRecord = () => !!(MR() && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);

/**
 * First supported container, or '' (let the browser choose).
 * @param {(t: string) => boolean} [supported]
 */
export function pickType(supported = (t) => !!MR()?.isTypeSupported?.(t)) {
  return TYPES.find((t) => supported(t)) ?? '';
}

/**
 * Map a getUserMedia / MediaRecorder failure to an error code for `voice.err.*`.
 * @param {any} e
 * @returns {'mic-denied' | 'no-mic' | 'mic-failed'}
 */
export function micError(e) {
  const n = e?.name ?? '';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'mic-denied';
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'no-mic';
  return 'mic-failed';
}

/**
 * Loudness 0..1 from analyser time-domain bytes (RMS, scaled so speech fills the meter).
 * @param {Uint8Array} buf
 */
export function level(buf) {
  if (!buf.length) return 0;
  let sum = 0;
  for (const v of buf) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

/**
 * @typedef {object} Recording
 * @property {() => Promise<Blob>} stop Stop and get the audio (also called by the 30 s limit).
 * @property {() => void} cancel Stop and throw the audio away.
 * @property {Promise<Blob>} done Resolves with the audio once recording ends (any reason).
 */

/**
 * Ask for the mic and start recording.
 * @param {{onTick?: (ms: number) => void, onLevel?: (v: number) => void, maxMs?: number}} [o]
 * @returns {Promise<Recording>}
 * @throws {Error} message = 'mic-denied' | 'no-mic' | 'mic-failed'
 */
export async function startRecording(o = {}) {
  const maxMs = o.maxMs ?? MAX_REC_MS;
  /** @type {MediaStream} */
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    throw new Error(micError(e));
  }
  const release = () => stream.getTracks().forEach((tr) => tr.stop());
  const type = pickType();
  let rec;
  try {
    rec = new (MR())(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: BITRATE });
  } catch {
    try {
      rec = new (MR())(stream);
    } catch (e) {
      release();
      throw new Error(micError(e));
    }
  }
  /** @type {Blob[]} */
  const chunks = [];
  let cancelled = false;
  const started = Date.now();

  // Level meter (optional: recording works without Web Audio).
  /** @type {AudioContext | null} */
  let ac = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let meter;
  try {
    const AC = /** @type {any} */ (globalThis).AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
    if (AC && o.onLevel) {
      ac = /** @type {AudioContext} */ (new AC());
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      meter = setInterval(() => {
        an.getByteTimeDomainData(buf);
        o.onLevel?.(level(buf));
      }, 80);
    }
  } catch {
    ac = null;
  }
  const tick = setInterval(() => {
    const ms = Date.now() - started;
    o.onTick?.(Math.min(ms, maxMs));
    if (ms >= maxMs) stop();
  }, 200);

  const done = new Promise((resolve) => {
    rec.ondataavailable = (/** @type {any} */ e) => e.data?.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(tick);
      clearInterval(meter);
      release();
      ac?.close?.().catch?.(() => {});
      resolve(new Blob(cancelled ? [] : chunks, { type: (rec.mimeType || type || 'audio/mp4').split(';')[0] }));
    };
  });
  function stop() {
    if (rec.state !== 'inactive') rec.stop();
    return done;
  }
  rec.start(1000);
  o.onTick?.(0);
  return {
    stop,
    cancel: () => {
      cancelled = true;
      void stop();
    },
    done,
  };
}

/** "0:07" for the timer. @param {number} ms */
export const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
