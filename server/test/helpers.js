// Shared test fixtures: default settings (same as the app's DAILY) and a fake browser
// subscription whose private keys let tests decrypt what the server sends.
import { createECDH, createDecipheriv, hkdfSync, randomBytes, generateKeyPairSync } from 'node:crypto';
import { settings as normalize } from '../src/validate.js';

export const TZ = 'Europe/Sofia';
export const SETTINGS = normalize({
  morning: true,
  wake: '07:30',
  loud: '08:15',
  protein: true,
  water: [
    { time: '11:00', on: true },
    { time: '14:00', on: true },
    { time: '17:00', on: true },
    { time: '20:00', on: true },
  ],
  checkinAm: { time: '11:00', on: true },
  checkinPm: { time: '19:30', on: true },
  bedtime: { time: '22:30', on: true },
});

/** A browser-side key pair + auth secret, and a decrypt() for aes128gcm bodies (RFC 8291). */
export function fakeBrowser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  /** @param {Uint8Array} body */
  const decrypt = (body) => {
    const b = Buffer.from(body);
    const salt = b.subarray(0, 16),
      rs = b.readUInt32BE(16),
      idlen = b[20],
      asPublic = b.subarray(21, 21 + idlen),
      ct = b.subarray(21 + idlen);
    const shared = ecdh.computeSecret(asPublic);
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]);
    const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    if (pt[pt.length - 1] !== 2) throw new Error('missing last-record delimiter');
    return { rs, idlen, text: pt.subarray(0, -1).toString('utf8') };
  };
  return { keys, decrypt };
}

/** A VAPID key pair in the format the Worker uses. */
export function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).subarray(-65).toString('base64url'),
    privateJwk: privateKey.export({ format: 'jwk' }),
    pem: publicKey,
  };
}

/** Instant of a Sofia wall-clock time (for readable tests). @param {string} iso e.g. '2026-10-20T07:30' */
export const sofia = (iso) => {
  // Find the instant whose Sofia wall clock equals `iso` (both UTC+2 and UTC+3 tried).
  for (const off of [3, 2]) {
    const ts = Date.parse(`${iso}:00+0${off}:00`);
    const s = new Intl.DateTimeFormat('sv', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(ts);
    if (s.replace(' ', 'T') === iso) return ts;
  }
  throw new Error(`no such Sofia time ${iso}`);
};
