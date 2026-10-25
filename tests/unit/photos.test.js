// 1.2.1 progress photo sessions: EXIF capture date, date fallback, sessions, before/after,
// monthly set + streak (also with a hand-edited date), slots, migration 2 → 3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exifDate, photoDateOf, pickPhotoDate } from '../../src/features/body/exif.js';
import {
  POSES,
  applySessionDate,
  assignSlots,
  beforeAfter,
  monthComplete,
  monthPoses,
  movePhoto,
  photoStreak,
  sessionDate,
  sessionsOf,
  sortPhotos,
} from '../../src/features/body/photo-logic.js';
import { DATA_VERSION, migrate } from '../../src/core/migrations.js';
import { at, dueSlots, dailyOnCount, planDay } from '../../src/features/daily/logic.js';
import { DAILY } from '../../src/core/settings.js';
import { pickOther, PHOTO_VARIANTS } from '../../src/features/celebrations/index.js';
import { fmtVolume, setLang } from '../../src/core/i18n.js';

const fx = (n) => {
  const b = readFileSync(new URL(`../fixtures/${n}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const NOW = new Date(2026, 9, 19, 9, 30).getTime(); // 19 Oct 2026, 09:30 local

test('EXIF: DateTimeOriginal from a little-endian (II) JPEG, not IFD0 DateTime', () => {
  assert.deepEqual(exifDate(fx('exif-ii.jpg')), { date: '2026-10-18', time: '18:42' });
});

test('EXIF: big-endian (MM) JPEG', () => {
  assert.deepEqual(exifDate(fx('exif-mm.jpg')), { date: '2025-12-31', time: '23:59' });
});

test('EXIF: no EXIF, not a JPEG, truncated or garbage → null (never throws)', () => {
  assert.equal(exifDate(fx('no-exif.jpg')), null);
  assert.equal(exifDate(new ArrayBuffer(0)), null);
  assert.equal(exifDate(new TextEncoder().encode('GIF89a not a jpeg').buffer), null);
  const ii = new Uint8Array(fx('exif-ii.jpg'));
  for (const n of [3, 12, 30, 60, 120]) assert.equal(exifDate(ii.slice(0, n).buffer), null, `cut at ${n}`);
  const junk = new Uint8Array(400).map((_, i) => (i * 97 + 13) & 255);
  ((junk[0] = 0xff), (junk[1] = 0xd8), (junk[2] = 0xff), (junk[3] = 0xe1));
  assert.equal(exifDate(junk.buffer), null);
});

test('photo date: EXIF wins; else an older file date; else the upload moment', () => {
  const exif = { date: '2026-10-18', time: '18:42' };
  assert.deepEqual(pickPhotoDate({ exif, lastModified: NOW, now: NOW }), { ...exif, source: 'exif' });
  // no EXIF (e.g. HEIC converted by iOS): lastModified from yesterday is used
  const y = new Date(2026, 9, 18, 7, 5).getTime();
  assert.deepEqual(pickPhotoDate({ exif: null, lastModified: y, now: NOW }), {
    date: '2026-10-18',
    time: '07:05',
    source: 'file',
  });
  // lastModified today (a fresh camera capture / conversion) → the upload moment
  const today = new Date(2026, 9, 19, 6, 0).getTime();
  assert.deepEqual(pickPhotoDate({ exif: null, lastModified: today, now: NOW }), {
    date: '2026-10-19',
    time: '09:30',
    source: 'upload',
  });
  assert.equal(pickPhotoDate({ exif: null, now: NOW }).source, 'upload');
  assert.equal(pickPhotoDate({ exif: null, lastModified: 0, now: NOW }).source, 'upload');
  // a future or absurd EXIF date is ignored
  assert.equal(
    pickPhotoDate({ exif: { date: '2027-01-01', time: '10:00' }, lastModified: y, now: NOW }).source,
    'file',
  );
  assert.equal(pickPhotoDate({ exif: { date: '1970-01-01', time: '00:00' }, now: NOW }).source, 'upload');
});

test('photoDateOf reads a File/Blob (EXIF fixture and no-EXIF fallback)', async () => {
  const f = new File([fx('exif-ii.jpg')], 'a.jpg', { type: 'image/jpeg', lastModified: NOW });
  assert.deepEqual(await photoDateOf(f, NOW), { date: '2026-10-18', time: '18:42', source: 'exif' });
  const old = new Date(2026, 9, 10, 12, 0).getTime();
  const g = new File([fx('no-exif.jpg')], 'b.heic', { lastModified: old });
  assert.equal((await photoDateOf(g, NOW)).date, '2026-10-10');
});

/** @param {Partial<import('../../src/features/body/photo-logic.js').Photo>} o */
const ph = (o) =>
  /** @type {any} */ ({ ts: 0, time: '', ...o, shot: o.shot ?? { date: o.date, time: o.time ?? '', source: 'exif' } });

test('session date = earliest capture date of its photos; an edited date wins and sticks', () => {
  const s = [
    ph({
      id: 'a',
      session: 's',
      pose: 'front',
      date: '2026-10-19',
      shot: { date: '2026-10-19', time: '08:00', source: 'upload' },
    }),
    ph({
      id: 'b',
      session: 's',
      pose: 'back',
      date: '2026-10-19',
      shot: { date: '2026-10-18', time: '18:42', source: 'exif' },
    }),
  ];
  assert.deepEqual(sessionDate(s), { date: '2026-10-18', time: '18:42', edited: false });
  const rows = applySessionDate(s);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.date === '2026-10-18'));
  const edited = applySessionDate(rows, { date: '2026-10-17', time: '' });
  assert.ok(edited.every((r) => r.date === '2026-10-17' && r.edited));
  // a photo added later does not override her date
  const more = [...edited, ph({ id: 'c', session: 's', pose: 'left', date: '2026-10-01' })];
  assert.deepEqual(sessionDate(more), { date: '2026-10-17', time: '', edited: true });
  assert.equal(sessionDate([]), null);
});

test('editing a date re-sorts the timeline and the per-pose before/after', () => {
  let all = [
    ph({ id: 'o', session: 's1', pose: 'front', date: '2026-09-01', ts: 1 }),
    ph({ id: 'n', session: 's2', pose: 'front', date: '2026-10-01', ts: 2 }),
  ];
  assert.deepEqual(
    sessionsOf(all).map((s) => s.id),
    ['s1', 's2'],
  );
  assert.equal(beforeAfter(all, 'front').before?.id, 'o');
  assert.equal(beforeAfter(all, 'front').after?.id, 'n');
  // she moves s2 back to August (taken earlier, uploaded later)
  const ch = applySessionDate(
    all.filter((p) => p.session === 's2'),
    { date: '2026-08-15', time: '' },
  );
  all = all.map((p) => ch.find((c) => c.id === p.id) ?? p);
  assert.deepEqual(
    sessionsOf(all).map((s) => s.id),
    ['s2', 's1'],
  );
  assert.equal(beforeAfter(all, 'front').before?.id, 'n');
  assert.equal(beforeAfter(all, 'front').after?.id, 'o');
  assert.deepEqual(
    sortPhotos(all).map((p) => p.id),
    ['n', 'o'],
  );
});

test('before/after: never the same photo on both sides; one photo = "now" only', () => {
  const one = [ph({ id: 'x', session: 's', pose: 'back', date: '2026-10-01' })];
  assert.deepEqual({ b: beforeAfter(one, 'back').before, a: beforeAfter(one, 'back').after?.id }, { b: null, a: 'x' });
  assert.equal(beforeAfter(one, 'front').after, null);
  const two = [...one, ph({ id: 'y', session: 't', pose: 'back', date: '2026-10-02' })];
  const r = beforeAfter(two, 'back');
  assert.notEqual(r.before?.id, r.after?.id);
});

test('monthly set: 4 poses across sessions of the month (by session date, edited too)', () => {
  const m = [
    ph({ id: '1', session: 'a', pose: 'front', date: '2026-10-01' }),
    ph({ id: '2', session: 'a', pose: 'back', date: '2026-10-01' }),
    ph({ id: '3', session: 'b', pose: 'left', date: '2026-10-12' }),
  ];
  assert.equal(monthPoses(m, '2026-10').size, 3);
  assert.equal(monthComplete(m, '2026-10'), false);
  // the right pose was taken 30 Sep but she sets the date to 1 Oct → counts for October
  const sep = [ph({ id: '4', session: 'c', pose: 'right', date: '2026-09-30' })];
  assert.equal(monthComplete([...m, ...sep], '2026-10'), false);
  const moved = applySessionDate(sep, { date: '2026-10-01', time: '' });
  assert.equal(monthComplete([...m, ...moved], '2026-10'), true);
});

/** Full set for a month. @param {string} mo */
const full = (mo) => POSES.map((p, i) => ph({ id: `${mo}${p}`, session: mo, pose: p, date: `${mo}-0${i + 1}` }));

test('monthly streak: consecutive complete months; this month counts once complete', () => {
  const all = [...full('2026-07'), ...full('2026-08'), ...full('2026-09')];
  assert.deepEqual(photoStreak(all, '2026-10'), { current: 3, best: 3, thisMonth: false });
  assert.deepEqual(photoStreak([...all, ...full('2026-10')], '2026-10'), { current: 4, best: 4, thisMonth: true });
  // a gap breaks it; best remembers the old run
  const gap = [...full('2026-03'), ...full('2026-04'), ...full('2026-09')];
  assert.deepEqual(photoStreak(gap, '2026-10'), { current: 1, best: 2, thisMonth: false });
  // year boundary
  assert.equal(photoStreak([...full('2025-12'), ...full('2026-01')], '2026-02').current, 2);
  // an edited date can complete (and so extend) a month
  const aug = full('2026-08').filter((p) => p.pose !== 'left');
  const left = applySessionDate([ph({ id: 'L', session: 'L', pose: 'left', date: '2026-10-01' })], {
    date: '2026-08-20',
    time: '',
  });
  assert.equal(photoStreak([...aug, ...full('2026-09')], '2026-10').current, 1);
  assert.equal(photoStreak([...aug, ...left, ...full('2026-09')], '2026-10').current, 2);
});

test('"add several" fills the empty slots in order; move swaps slots', () => {
  assert.deepEqual(assignSlots(4, []), ['front', 'back', 'left', 'right']);
  assert.deepEqual(assignSlots(2, ['back']), ['front', 'left']);
  assert.deepEqual(assignSlots(5, ['front', 'back', 'left']), ['right']);
  assert.deepEqual(assignSlots(1, POSES), []);
  const s = [ph({ id: 'a', session: 's', pose: 'front' }), ph({ id: 'b', session: 's', pose: 'back' })];
  assert.deepEqual(
    movePhoto(s, 'a', 'back').map((p) => [p.id, p.pose]),
    [
      ['a', 'back'],
      ['b', 'front'],
    ],
  );
  assert.deepEqual(
    movePhoto(s, 'a', 'left').map((p) => [p.id, p.pose]),
    [['a', 'left']],
  );
  assert.deepEqual(movePhoto(s, 'a', 'front'), []);
});

test('migration 2 → 3 keeps every photo (blob, date) as a Front session; idempotent', () => {
  const blob = { size: 1234 };
  const old = {
    app: 'vidrichka-fitness',
    version: 2,
    stores: {
      photos: [
        { id: 'p1', date: '2026-05-01', blob },
        { id: 'p2', date: '2026-06-01', ts: 99, blob },
      ],
      days: [{ id: '2026-10-01', wake: '07:00' }],
    },
  };
  const out = migrate(old);
  assert.equal(out.version, DATA_VERSION);
  assert.equal(out.stores.photos.length, 2);
  const [a, b] = out.stores.photos;
  assert.equal(a.session, 'ps_p1');
  assert.equal(a.pose, 'front');
  assert.equal(a.date, '2026-05-01');
  assert.deepEqual(a.blob, blob);
  assert.ok(Number.isFinite(a.ts) && a.ts > 0);
  assert.deepEqual(a.shot, { date: '2026-05-01', time: '', source: 'upload' });
  assert.equal(b.ts, 99);
  assert.deepEqual(out.stores.days, old.stores.days, 'other stores untouched');
  assert.equal(old.stores.photos[0].session, undefined, 'input not mutated');
  // already-migrated rows pass through unchanged (e.g. a 1.2.1 backup re-imported)
  const again = migrate({ ...out, version: 2 });
  assert.deepEqual(again.stores.photos, out.stores.photos);
  // a backup without photos stays without
  assert.equal(migrate({ app: 'vidrichka-fitness', version: 2, stores: {} }).stores.photos, undefined);
});

test('daily plan: the monthly photo reminder on the 1st, skipped once the set is done', () => {
  const cfg = structuredClone(DAILY);
  const s = planDay('2026-11-01', cfg).filter((x) => x.group === 'photos');
  assert.equal(s.length, 1);
  assert.equal(s[0].at, at('2026-11-01', '10:00'));
  assert.equal(s[0].route, 'progress/body');
  assert.equal(planDay('2026-11-02', cfg).filter((x) => x.group === 'photos').length, 0);
  const now = at('2026-11-01', '10:01');
  assert.equal(dueSlots(planDay('2026-11-01', cfg), now, {}).show.filter((x) => x.group === 'photos').length, 1);
  assert.equal(
    dueSlots(planDay('2026-11-01', cfg), now, { '2026-11-01': { photoSet: 1 } }).show.filter(
      (x) => x.group === 'photos',
    ).length,
    0,
  );
  cfg.photos.on = false;
  assert.equal(planDay('2026-11-01', cfg).filter((x) => x.group === 'photos').length, 0);
  assert.equal(dailyOnCount(DAILY) - dailyOnCount(cfg), 1, 'counted in the reminders summary');
});

test('small celebration variants never repeat twice in a row', () => {
  assert.ok(PHOTO_VARIANTS.length >= 3);
  for (let last = 0; last < 4; last++)
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const i = pickOther(4, last, () => r);
      assert.ok(i >= 0 && i < 4 && i !== last);
    }
  assert.equal(pickOther(1, 0), 0);
});

test('volume: one formatter, BG thousands separator, kg below 10 t, tonnes from 10 t', async () => {
  await setLang('bg');
  const sp = (s) => s.replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(sp(fmtVolume(3960).text), '3 960 kg');
  assert.equal(sp(fmtVolume(999).text), '999 kg');
  assert.equal(sp(fmtVolume(5800).text), '5 800 kg');
  assert.equal(sp(fmtVolume(12400).text), '12,4 t');
  assert.equal(sp(fmtVolume(1234567).text), '1 234,6 t');
  assert.equal(fmtVolume(12400).unit, 't');
  assert.equal(fmtVolume(9000).unit, 'kg');
  await setLang('en');
  assert.equal(fmtVolume(3960).text, '3,960 kg');
  assert.equal(fmtVolume(12400).text, '12.4 t');
  assert.equal(fmtVolume(0).text, '0 kg');
});

test('push text table: the monthly photo reminder exists on client and server ', async () => {
  const client = (await import('../../src/features/daily/push-format.js')).TEXT_KINDS;
  const server = (await import('../../server/src/validate.js')).TEXT_KINDS;
  const { DEFAULT_TEXTS } = await import('../../server/src/messages.js');
  assert.deepEqual([...client], server);
  assert.ok(client.includes('photos'));
  assert.ok(DEFAULT_TEXTS.photos?.title && DEFAULT_TEXTS.photos?.body);
});
