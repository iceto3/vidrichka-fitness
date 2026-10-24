/**
 * Device feedback helpers: short beeps (Web Audio, works on iOS once unlocked by a tap),
 * vibration where supported (not on iOS), screen wake lock and local notifications.
 * @module ui/feedback
 */

/** @type {AudioContext|null} */
let ctx = null;

/** Create/resume the audio context; call from a user gesture (required by iOS Safari). */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/**
 * Play a short chime.
 * @param {number[]} [notes] Frequencies in Hz, played in sequence.
 */
export function beep(notes = [880, 1175, 1568]) {
  if (!ctx || ctx.state === 'closed') return;
  try {
    const t0 = ctx.currentTime;
    notes.forEach((f, i) => {
      const o = /** @type {AudioContext} */ (ctx).createOscillator(),
        g = /** @type {AudioContext} */ (ctx).createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0 + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.25);
      o.connect(g).connect(/** @type {AudioContext} */ (ctx).destination);
      o.start(t0 + i * 0.16);
      o.stop(t0 + i * 0.16 + 0.3);
    });
  } catch {
    /* no audio device (e.g. headless, or another app owns audio) */
  }
}

/** @type {Map<string, Promise<AudioBuffer|null>>} */
const buffers = new Map();

/** Fetch + decode a sound once (served from the service-worker precache when offline). @param {string} url */
export function loadSound(url) {
  if (!ctx) return Promise.resolve(null);
  if (!buffers.has(url))
    buffers.set(
      url,
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => /** @type {AudioContext} */ (ctx).decodeAudioData(b))
        .catch(() => null),
    );
  return /** @type {Promise<AudioBuffer|null>} */ (buffers.get(url));
}

/**
 * Play a short sound file through the shared (tap-unlocked) audio context.
 * Silently does nothing before the first tap, or without an audio device.
 * @param {string} url
 * @param {number} [delay] Seconds from now.
 * @param {number} [volume]
 */
export async function playSound(url, delay = 0, volume = 0.9) {
  const buf = await loadSound(url);
  if (!buf || !ctx || ctx.state === 'closed') return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {}); // iOS suspends it in the background
  try {
    const s = ctx.createBufferSource(),
      g = ctx.createGain();
    g.gain.value = volume;
    s.buffer = buf;
    s.connect(g).connect(ctx.destination);
    s.start(ctx.currentTime + delay);
  } catch {
    /* no audio device */
  }
}

/** Whether vibration is supported (false on iOS Safari). */
export const canVibrate = () => typeof navigator.vibrate === 'function';

/** Vibrate if supported. @param {number|number[]} pattern */
export const vibrate = (pattern) => canVibrate() && navigator.vibrate(pattern);

/** @type {any} */
let lock = null;

/** Keep the screen on (no-op where unsupported). */
export async function keepAwake() {
  try {
    lock = await /** @type {any} */ (navigator).wakeLock?.request('screen');
  } catch {
    lock = null;
  }
}

/** Release the wake lock. */
export const releaseAwake = () => (lock?.release?.(), (lock = null));

/**
 * Show a local notification through the service worker (if permitted).
 * @param {string} title
 * @param {string} body
 * @param {string} [tag]
 */
export async function notify(title, body, tag = 'vf') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg)
    await reg.showNotification(title, {
      body,
      tag,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
    });
  else new Notification(title, { body, tag });
  return true;
}
