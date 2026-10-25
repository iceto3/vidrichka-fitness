// Web Push encryption (RFC 8291 aes128gcm) and VAPID (RFC 8292) with WebCrypto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify } from 'node:crypto';
import { b64url, encrypt, pushRequest, unb64url, vapidSigner } from '../src/webpush.js';
import { fakeBrowser, vapidKeys } from './helpers.js';

test('matches the RFC 8291 Appendix A example byte for byte', async () => {
  const jwk = (pub, d) => {
    const p = unb64url(pub);
    return { kty: 'EC', crv: 'P-256', x: b64url(p.slice(1, 33)), y: b64url(p.slice(33)), d };
  };
  const asPub = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const k = jwk(asPub, 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
  const alg = { name: 'ECDH', namedCurve: 'P-256' };
  const serverKeys = {
    privateKey: await crypto.subtle.importKey('jwk', k, alg, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('jwk', { ...k, d: undefined }, alg, true, []),
  };
  const body = await encrypt(
    new TextEncoder().encode('When I grow up, I want to be a watermelon'),
    {
      p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    },
    { salt: unb64url('DGv6ra1nlYgDCS1FRnbzlw'), serverKeys },
  );
  assert.equal(
    b64url(body),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

test('a browser can decrypt what we send (fresh keys and salt each time)', async () => {
  const b = fakeBrowser();
  const msg = JSON.stringify({ title: 'Добро утро ☀️', body: 'x'.repeat(300) });
  const one = await encrypt(new TextEncoder().encode(msg), b.keys),
    two = await encrypt(new TextEncoder().encode(msg), b.keys);
  assert.notDeepEqual(one, two);
  const d = b.decrypt(one);
  assert.equal(d.text, msg);
  assert.equal(d.rs, 4096);
  assert.equal(d.idlen, 65);
});

test('rejects malformed subscription keys', async () => {
  await assert.rejects(encrypt(new Uint8Array(1), { p256dh: 'AAAA', auth: 'AAAA' }), /bad subscription keys/);
});

test('VAPID JWT is ES256-signed for the push service origin and cached', async () => {
  const v = vapidKeys();
  const sign = vapidSigner({ publicKey: v.publicKey, privateJwk: v.privateJwk, subject: 'https://example.org/' });
  const now = Date.parse('2026-10-25T06:00:00Z');
  const auth = await sign('https://fcm.googleapis.com/fcm/send/abc', now);
  const [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, v.publicKey);
  const [h, p, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'https://example.org/');
  assert.equal(claims.exp, now / 1000 + 12 * 3600);
  const ok = createVerify('sha256')
    .update(`${h}.${p}`)
    .verify({ key: v.pem, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.ok(ok, 'signature verifies');
  assert.equal(await sign('https://fcm.googleapis.com/fcm/send/other', now + 60e3), auth, 'cached per origin');
  assert.notEqual(await sign('https://web.push.apple.com/x', now), auth);
});

test('push request has the Web Push headers', async () => {
  const b = fakeBrowser(),
    v = vapidKeys();
  const sign = vapidSigner({ publicKey: v.publicKey, privateJwk: v.privateJwk, subject: 'mailto:a@b.c' });
  const req = await pushRequest({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', ...b.keys }, { hi: 1 }, sign, {
    topic: 'vf-water',
    ttl: 600,
  });
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.get('content-encoding'), 'aes128gcm');
  assert.equal(req.headers.get('ttl'), '600');
  assert.equal(req.headers.get('topic'), 'vf-water');
  assert.match(req.headers.get('authorization'), /^vapid t=/);
  assert.equal(b.decrypt(new Uint8Array(await req.arrayBuffer())).text, '{"hi":1}');
});
