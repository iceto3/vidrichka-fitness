/**
 * 1.4.1: verified exercise technique – every exercise has complete technique content and a
 * two-frame illustration, and nothing of the old unverified steps/tips/stick figures is left.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISES } from '../../src/data/exercises.js';
import { TECHNIQUE } from '../../src/data/technique.js';
import { THUMBS } from '../../src/data/figure-thumbs.js';
import en from '../../src/data/i18n/en.js';
import bg from '../../src/data/i18n/bg.js';
import { L, isGendered, setLang } from '../../src/core/i18n.js';

const ids = EXERCISES.map((e) => e.id);
const figure = async (/** @type {string} */ id) => (await import(`../../src/data/figures/${id}.js`)).default;
/** @param {any} v */
const plain = (v) => (isGendered(v) ? `${v.f} ${v.m}` : v);
const nonEmpty = (/** @type {any} */ v) => typeof plain(v) === 'string' && plain(v).trim().length > 3;

test('all 20 exercises – and only they – have verified technique content (ids unchanged)', () => {
  assert.equal(ids.length, 20);
  assert.deepEqual(Object.keys(TECHNIQUE).sort(), [...ids].sort());
  // the ids users' history refers to (never renamed)
  for (const id of ['hip_thrust', 'back_squat', 'romanian_deadlift', 'db_bench_press', 'plank', 'dead_bug'])
    assert.ok(ids.includes(id), id);
});

test('technique content is complete: setup, steps, breathing, key points, mistakes → fix, muscles, sources', () => {
  for (const id of ids) {
    const x = TECHNIQUE[id];
    assert.ok(x.setup.length >= 2 && x.setup.every(nonEmpty), `${id} setup`);
    assert.ok(x.steps.length >= 3 && x.steps.every(nonEmpty), `${id} steps`);
    assert.ok(x.breathing.length >= 1 && x.breathing.every(nonEmpty), `${id} breathing`);
    assert.ok(x.keyPoints.length >= 3 && x.keyPoints.every(nonEmpty), `${id} key points`);
    assert.ok(x.mistakes.length >= 3, `${id} mistakes`);
    for (const m of x.mistakes) assert.ok(nonEmpty(m.mistake) && nonEmpty(m.fix), `${id} mistake/fix`);
    assert.ok(/^Основ/.test(x.muscles[0].role) && x.muscles.every((m) => m.role && m.text), `${id} muscles`);
    assert.ok(x.sources.length >= 2, `${id} sources`);
    assert.ok(
      x.sources.some((s) => /NSCA/.test(s.text)),
      `${id} cites NSCA`,
    );
    assert.ok(
      x.sources.some((s) => /^https:\/\/(exrx\.net|www\.acefitness\.org)\//.test(s.url ?? '')),
      `${id} links ACE/ExRx`,
    );
    for (const s of x.sources) if (s.url) assert.match(s.url, /^https:\/\/[^\s"'<>]+$/, `${id} url`);
    assert.equal(x.frames.length, 2, `${id} frames`);
    for (const f of x.frames) assert.ok(f.label && f.legend.length >= 1 && f.legend.every(Boolean), `${id} frame text`);
    // Bulgarian, no markup other than **bold** / *italic*, no unresolved gender slashes
    const all = JSON.stringify(x);
    assert.ok(/[а-я]/.test(all), `${id} Bulgarian`);
    assert.doesNotMatch(all, /<|>|изправена\/|\|/, `${id} raw markup`);
  }
});

test('every exercise has a 2-frame illustration with numbered markers matching its legend, and a thumbnail', async () => {
  const seen = new Set();
  for (const id of ids) {
    const frames = await figure(id);
    assert.equal(frames.length, 2, id);
    frames.forEach((svg, i) => {
      assert.match(svg, /^<svg [^>]*class="vf"[^>]*viewBox="0 0 340 292"/, `${id} ${i}`);
      assert.match(svg, /aria-hidden="true"/);
      const markers = svg.match(/class="c-cot"[^>]*>(\d)</g) ?? [];
      assert.equal(markers.length, TECHNIQUE[id].frames[i].legend.length, `${id} frame ${i + 1} markers`);
      assert.doesNotMatch(
        svg,
        /<script|<text class="(plt|c-leg)"|\son[a-z]+=|href="(?!#)|<image|<foreignObject/i,
        `${id} safe`,
      );
      // gradients/clip paths referenced from the markup exist, ids are unique across all SVGs
      for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(svg.includes(`id="${ref}"`), `${id} ${ref}`);
      for (const [, i2] of svg.matchAll(/\sid="([^"]+)"/g)) {
        assert.ok(!seen.has(i2), `duplicate id ${i2}`);
        seen.add(i2);
      }
    });
    assert.ok(frames.join('').length < 22000, `${id} optimized (${frames.join('').length} B)`);
    assert.match(THUMBS[id], /^<svg [^>]*class="vf"/, `${id} thumbnail`);
    assert.doesNotMatch(THUMBS[id], /c-cot|c-lead|<text/, `${id} thumbnail has no markers`);
    assert.ok(THUMBS[id].length < 8000, `${id} thumbnail size`);
  }
  assert.deepEqual(Object.keys(THUMBS).sort(), [...ids].sort());
});

test('no leftover of the old unverified steps, tips and stick figures', () => {
  const allowed = ['id', 'name', 'equipment', 'place', 'weighted', 'unit', 'primary', 'secondary', 'rest', 'met'];
  for (const e of EXERCISES)
    assert.deepEqual(
      Object.keys(e).filter((k) => !allowed.includes(k)),
      [],
      `${e.id} has only library fields (no fig/steps/tips)`,
    );
  assert.ok(!existsSync('src/features/library/figures.js'), 'stick figures removed');
  for (const k of ['library.tips', 'library.step']) assert.ok(!(k in en) && !(k in bg), k);
  /** @type {string[]} */
  const files = [];
  const walk = (/** @type {string} */ d) =>
    readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
  walk('src');
  const old = [
    'stepFigure',
    'Избутай таза назад, сякаш затваряш врата',
    'Води с лактите, не с китките.',
    'Не повдигай рамене – вратът е отпуснат.',
    'Избутвай нагоре и леко навътре.',
    'Push your hips back like closing a door',
    'Stand tall, soft knees',
  ];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const o of old) assert.ok(!src.includes(o), `${f} still has "${o}"`);
  }
});

test('rich text: escaped, only **bold** / *italic* become markup', async () => {
  const { rich } = await import('../../src/features/library/figure.js');
  assert.equal(
    String(rich('Лостът е над **средата** на <b>стъпалото</b> *2016*')),
    'Лостът е над <strong>средата</strong> на &lt;b&gt;стъпалото&lt;/b&gt; <em>2016</em>',
  );
});

test('technique sheet / page: sections in order, mistakes as mistake → fix, sources as links, drawings after loading', async () => {
  await setLang('bg');
  const { techniqueBody } = await import('../../src/features/library/technique.js');
  const { loadFigure } = await import('../../src/features/library/figure.js');
  const before = String(techniqueBody('back_squat'));
  assert.match(before, /class="tsvg wait"/);
  const heads = [...before.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(heads, [
    'Изходна позиция',
    'Изпълнение',
    'Дишане',
    'Ключови точки',
    'Чести грешки → как да ги избегнеш',
    'Подробно за мускулите',
    'Източници',
  ]);
  assert.match(before, /1 · Изходна позиция/);
  assert.match(before, /<li><i aria-hidden="true">1<\/i><span>Лостът над средата на стъпалото<\/span><\/li>/);
  assert.equal((before.match(/class="mis"/g) ?? []).length, TECHNIQUE.back_squat.mistakes.length);
  assert.equal((before.match(/class="fix"/g) ?? []).length, TECHNIQUE.back_squat.mistakes.length);
  assert.match(
    before,
    /<a href="https:\/\/exrx\.net\/WeightExercises\/Quadriceps\/BBSquat" target="_blank" rel="noopener noreferrer">/,
  );
  assert.match(before, /<ol class="tlist num">/);
  await loadFigure('back_squat');
  const after = String(techniqueBody('back_squat'));
  assert.equal((after.match(/<svg [^>]*class="vf"/g) ?? []).length, 2);
  assert.doesNotMatch(after, /tsvg wait/);
  assert.deepEqual(await loadFigure('no_such_exercise'), []);
  await setLang('en');
  assert.match(String(techniqueBody('plank')), /The technique descriptions are in Bulgarian\./);
  assert.match(String(techniqueBody('plank')), /Starting position/);
});

test('gendered technique text resolves to one form', async () => {
  await setLang('bg');
  const g = TECHNIQUE.romanian_deadlift.setup.find(isGendered);
  assert.ok(g);
  assert.doesNotMatch(L(g), /\//);
  await setLang('en');
});

test("1.4.1: version, What's new entry in Bulgarian", async () => {
  // 1.4.2: the version moved on (checked in v142.test.js); the 1.4.1 entry stays as shipped.
  const { NOTES, newSince } = await import('../../src/features/whatsnew/notes.js');
  assert.ok(NOTES.some((n) => n.v === '1.4.1'));
  assert.deepEqual(
    newSince('1.4.0', { voice: false, push: false }, NOTES, '1.4.1').items.map(([, k]) => k),
    ['whatsNew.technique141'],
  );
  assert.equal(
    bg['whatsNew.technique141'],
    'Нови, точни илюстрации и описания на техниката за всички 20 упражнения, с ключови точки и чести грешки, сверени с NSCA, ACE и ExRx.',
  );
  assert.ok(en['whatsNew.technique141']);
});
