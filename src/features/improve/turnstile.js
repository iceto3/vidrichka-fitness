/**
 * Invisible Cloudflare Turnstile for the feedback form (1.4.0). Loaded only when the
 * channel has a site key (core/channel TURNSTILE_SITEKEY); no captcha is shown to people.
 * The token is sent with the message and checked once by the push Worker.
 * @module features/improve/turnstile
 */

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** @type {Promise<any> | null} */
let loading = null;

/** Load the Turnstile script once. */
function load() {
  const w = /** @type {any} */ (globalThis);
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (w.turnstile ? ok(w.turnstile) : fail(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      fail(new Error('turnstile'));
    };
    document.head.append(s);
  });
  return loading;
}

/**
 * Get a fresh token (≤ 20 s). @param {string} sitekey @returns {Promise<string>}
 */
export async function turnstileToken(sitekey) {
  const ts = await load();
  const box = document.createElement('div');
  box.className = 'sr-only';
  document.body.append(box);
  try {
    return await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('turnstile')), 20_000);
      ts.render(box, {
        sitekey,
        callback: (/** @type {string} */ t) => (clearTimeout(timer), ok(t)),
        'error-callback': () => (clearTimeout(timer), fail(new Error('turnstile'))),
      });
    });
  } finally {
    box.remove();
  }
}
