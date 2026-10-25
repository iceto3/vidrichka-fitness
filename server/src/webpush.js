/**
 * Web Push with nothing but WebCrypto (works in Workers and Node ≥ 20):
 * - VAPID (RFC 8292): an ES256 JWT per push-service origin, cached for 12 h.
 * - Message encryption (RFC 8291, `aes128gcm` content coding from RFC 8188): ECDH with
 *   the browser's p256dh key, HKDF with its auth secret, one AES-128-GCM record.
 * @module webpush
 */

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

/** @param {Uint8Array|ArrayBuffer} b */
export const b64url = (b) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** @param {string} s */
export const unb64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** @param {...Uint8Array} parts */
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};

/** HKDF-SHA-256 (extract + expand). @param {Uint8Array} salt @param {Uint8Array} ikm @param {Uint8Array} info @param {number} len */
async function hkdf(salt, ikm, info, len) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/**
 * Encrypt a payload for one subscription (RFC 8291). `salt` and `serverKeys` are only
 * injected by tests; normally both are fresh per message.
 * @param {Uint8Array} payload
 * @param {{p256dh: string, auth: string}} keys Subscription keys (base64url).
 * @param {{salt?: Uint8Array, serverKeys?: CryptoKeyPair}} [opts]
 * @returns {Promise<Uint8Array>} The request body (header + one record).
 */
export async function encrypt(payload, keys, opts = {}) {
  const uaPublic = unb64url(keys.p256dh),
    authSecret = unb64url(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const as =
    opts.serverKeys ??
    /** @type {CryptoKeyPair} */ (
      await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    );
  const asPublic = new Uint8Array(await subtle.exportKey('raw', as.publicKey));
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record: payload + 0x02 delimiter (last record), no padding.
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/**
 * VAPID signer: imports the private key once and caches one JWT per audience.
 * @param {{publicKey: string, privateJwk: JsonWebKey, subject: string}} vapid
 */
export function vapidSigner(vapid) {
  /** @type {Promise<CryptoKey>|null} */
  let keyP = null;
  /** @type {Map<string, {jwt: string, exp: number}>} */
  const cache = new Map();
  return async (/** @type {string} */ endpoint, now = Date.now()) => {
    const aud = new URL(endpoint).origin;
    const hit = cache.get(aud);
    if (hit && hit.exp - now > 3600e3) return `vapid t=${hit.jwt}, k=${vapid.publicKey}`;
    keyP ??= subtle.importKey(
      'jwk',
      { ...vapid.privateJwk, key_ops: ['sign'] },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const exp = now + 12 * 3600e3;
    const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(exp / 1000), sub: vapid.subject })));
    const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await keyP, enc.encode(`${head}.${body}`));
    const jwt = `${head}.${body}.${b64url(sig)}`; // WebCrypto's ECDSA output is already JOSE r||s
    cache.set(aud, { jwt, exp });
    return `vapid t=${jwt}, k=${vapid.publicKey}`;
  };
}

/**
 * Build the push request for one subscription.
 * @param {{endpoint: string, p256dh: string, auth: string}} sub
 * @param {object} message Serialized as JSON (keep it well under 4 kB).
 * @param {(endpoint: string) => Promise<string>} sign VAPID signer
 * @param {{ttl?: number, urgency?: 'very-low'|'low'|'normal'|'high', topic?: string}} [o]
 * @returns {Promise<Request>}
 */
export async function pushRequest(sub, message, sign, o = {}) {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub);
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: await sign(sub.endpoint),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(o.ttl ?? 1800),
    Urgency: o.urgency ?? 'high',
  };
  if (o.topic) headers.Topic = o.topic; // a newer message with the same topic replaces an undelivered one
  return new Request(sub.endpoint, { method: 'POST', headers, body });
}
