/**
 * 1.4.1 tester round: no dev/meta notes in what users see, sources are title + link only, no
 * English/Latin words in the Bulgarian technique texts, one muscle glossary, the muscles section is
 * collapsible, the build id is visible, and the "new version" bar reserves its own strip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TECHNIQUE } from '../../src/data/technique.js';
import { EXERCISES } from '../../src/data/exercises.js';
import { MUSCLES, QUALIFIERS, ROLES, BANNED_VARIANTS, parseMuscles } from '../../src/data/muscle-glossary.js';
import { isGendered, setLang } from '../../src/core/i18n.js';
import bg from '../../src/data/i18n/bg.js';

/** every user-visible string of one exercise's technique, sources included */
const strings = (/** @type {any} */ v) => {
  /** @type {string[]} */ const out = [];
  const walk = (/** @type {any} */ x) => {
    if (typeof x === 'string') out.push(x);
    else if (isGendered(x)) out.push(x.f, x.m);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(v);
  return out;
};
const ids = Object.keys(TECHNIQUE);
const textsOf = (/** @type {string} */ id) => {
  const { sources: _sources, ...rest } = TECHNIQUE[id];
  return strings(rest);
};

test('no dev/meta notes anywhere users can see them (texts, legends, sources)', () => {
  const meta =
    /илюстраци|нарисуван|рисунк|няма отделна страница|показва вариант|на снимката|в източника|източникът|вариантът с|бележк|TODO|FIXME|проверено|сверено с|VERIFICATION/i;
  for (const id of ids) for (const s of strings(TECHNIQUE[id])) assert.doesNotMatch(s, meta, `${id}: ${s}`);
  // the release note itself may say the texts were checked against NSCA/ACE/ExRx – nothing else does
  for (const [k, v] of Object.entries(bg))
    if (k.startsWith('technique.')) assert.doesNotMatch(JSON.stringify(v), /илюстрацията|нарисуван/, k);
});

test('sources show only a title and a link', () => {
  for (const id of ids) {
    for (const s of TECHNIQUE[id].sources) {
      assert.deepEqual(Object.keys(s).sort(), s.url ? ['text', 'url'] : ['text'], `${id} source keys`);
      if (s.url) {
        // "ACE Exercise Library – Back Squat", "ExRx.net – Barbell Squat": a title, no remark after it
        assert.match(s.text, /^(ACE( Exercise Library| ProSource)?|ExRx\.net) – [^()]+$/, `${id}: ${s.text}`);
        assert.ok(s.text.length <= 70, `${id}: ${s.text}`);
      } else {
        // a printed NSCA book or journal article: a citation, ending with its year (and chapter)
        assert.match(s.text, /NSCA/, `${id}: ${s.text}`);
        assert.match(
          s.text,
          /(Human Kinetics, \d{4}(, глава „[^“]+“)?|\d+\(\d+\):\d+–\d+, \d{4})\.$/,
          `${id}: ${s.text}`,
        );
      }
    }
  }
});

test('back squat cites the real ACE Back Squat page', () => {
  const ace = TECHNIQUE.back_squat.sources.find((s) => /^ACE/.test(s.text));
  assert.deepEqual(ace, {
    text: 'ACE Exercise Library – Back Squat',
    url: 'https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/',
  });
});

test('no English / Latin-script words in the Bulgarian technique texts (source titles and brands aside)', () => {
  for (const id of ids)
    for (const s of textsOf(id))
      assert.doesNotMatch(s, /[A-Za-z]/, `${id}: ${s.match(/[A-Za-z][\w-]*/)?.[0]} in "${s}"`);
  for (const e of EXERCISES) assert.doesNotMatch(e.name.bg, /[A-Za-z]/, e.id);
  // and none of the reported ones crept back in, in any spelling
  const all = ids.flatMap(textsOf).join('\n');
  for (const w of [/bracing/i, /butt\s*wink/i, /hollow/i, /\bV-/, /брейсинг/i, /бът уинк/i, /\bcm\b/])
    assert.doesNotMatch(all, w);
});

test('muscle glossary: every muscles text uses only glossary names (+ an allowed qualifier)', () => {
  assert.equal(new Set(MUSCLES).size, MUSCLES.length, 'no duplicates');
  const used = new Set();
  for (const id of ids) {
    for (const m of TECHNIQUE[id].muscles) {
      assert.match(m.text, /^[^A-Za-z]+\.$/, `${id} ${m.role}`);
      const parts = parseMuscles(m.text);
      for (const p of parts) {
        assert.ok(MUSCLES.includes(p.name), `${id}: "${p.name}" is not in the glossary`);
        if (p.qualifier) assert.ok(QUALIFIERS.includes(p.qualifier), `${id}: qualifier ${p.qualifier}`);
        used.add(p.name);
      }
      assert.equal(new Set(parts.map((p) => p.name + p.qualifier)).size, parts.length, `${id}: listed twice`);
      // role label from the glossary, singular exactly when one muscle is listed
      const singular = Object.keys(ROLES).includes(m.role);
      assert.ok(singular || Object.values(ROLES).includes(m.role), `${id}: role ${m.role}`);
      if (singular) assert.equal(parts.length, 1, `${id}: "${m.role}" with ${parts.length} muscles`);
    }
  }
  // the glossary holds no dead entries
  for (const name of MUSCLES) assert.ok(used.has(name), `glossary entry not used: ${name}`);
});

test('muscle glossary: other spellings of the same muscles appear nowhere in the texts', () => {
  const all = ids.flatMap(textsOf).join('\n');
  for (const v of BANNED_VARIANTS) {
    const re = new RegExp(`(?<!\\p{L})${v}(?!\\p{L})`, 'iu');
    assert.doesNotMatch(all, re, `banned variant ${v}`);
  }
  // a common name in brackets ("(солеус)") is only ever used inside its glossary form
  for (const form of MUSCLES) {
    const m = /^(.*) \(([^()]+)\)$/.exec(form);
    if (!m) continue;
    const bare = new RegExp(`(?<!\\p{L})${m[2]}(?!\\p{L})`, 'giu');
    const n = (all.match(bare) ?? []).length;
    const full = all.split(form).length - 1;
    assert.equal(n, full, `"${m[2]}" outside "${form}"`);
  }
});

test('Bulgarian split squat: the sentence the tester asked for', () => {
  const all = textsOf('bulgarian_split_squat').join('\n');
  assert.match(all, /Ако тазобедрените флексори са сковани, остави торса по-изправен\./);
  assert.doesNotMatch(all, /Гъвкавите тазобедрени флексори помагат/);
});

test('muscles section is collapsible "Подробно за мускулите", collapsed by default', async () => {
  await setLang('bg');
  const { techniqueBody } = await import('../../src/features/library/technique.js');
  const h = String(techniqueBody('back_squat'));
  assert.match(h, /<details class="tsec muscles tmore"><summary><h3 class="h3 xb">Подробно за мускулите<\/h3>/);
  assert.doesNotMatch(h, /<details[^>]* open/);
  assert.doesNotMatch(h, /Работещи мускули/);
  await setLang('en');
});

test('morph keeps a <details> the user opened open', async () => {
  const src = readFileSync('src/ui/dom.js', 'utf8');
  assert.match(src, /name === 'open' && x\.tagName === 'DETAILS'/);
});

test("build id: one helper, shown in the Profile footer, the What's new page and the popup", async () => {
  const { buildId, APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(buildId(), APP_VERSION); // no document in node
  assert.match(
    readFileSync('src/features/profile/views/profile.js', 'utf8'),
    /id="pbuild">\$\{t\('whatsNew\.build', \{ id: buildId\(\) \}\)\}/,
  );
  assert.match(
    readFileSync('src/features/whatsnew/views/history.js', 'utf8'),
    /topBar\(t\('whatsNew\.page'\), `\$\{buildId\(\)\}/,
  );
  assert.match(readFileSync('src/main.js', 'utf8'), /id="wnbuild">\$\{t\('whatsNew\.build', \{ id: buildId\(\) \}\)\}/);
  assert.match(readFileSync('tools/build.mjs', 'utf8'), /name="vf-build"/);
});

test('update bar reserves its own strip: --sat includes --updh, the bar sits under the notch', () => {
  const base = readFileSync('src/styles/base.css', 'utf8');
  const comp = readFileSync('src/styles/components.css', 'utf8');
  assert.match(base, /--updh: 0px;/);
  assert.match(base, /--sat: calc\(env\(safe-area-inset-top, 0px\) \+ var\(--updh\)\);/);
  assert.match(
    comp,
    /\.update-bar \{\n {2}position: fixed;\n {2}left: 12px;\n {2}right: 12px;\n {2}top: calc\(env\(safe-area-inset-top, 0px\) \+ 6px\);/,
  );
  assert.match(readFileSync('src/main.js', 'utf8'), /setProperty\('--updh'/);
});

test('bottom nav: fixed, centred without a transform, kept on screen while zoomed', async () => {
  const comp = readFileSync('src/styles/components.css', 'utf8');
  const nav = /\n\.nav \{([^}]+)\}/.exec(comp)?.[1] ?? '';
  assert.match(nav, /position: fixed;/);
  assert.match(nav, /bottom: 0;/);
  assert.doesNotMatch(nav, /transform:/);
  const { pinNav } = await import('../../src/ui/nav-pin.js');
  // fake zoomed visual viewport: the bar is moved onto it and scaled back to its normal size
  /** @type {Record<string, Function>} */ const on = {};
  const props = new Map();
  const cls = new Set();
  const bar = { offsetWidth: 390 };
  const host = /** @type {any} */ ({
    classList: { toggle: (/** @type {string} */ c, /** @type {boolean} */ v) => (v ? cls.add(c) : cls.delete(c)) },
    style: { setProperty: (/** @type {string} */ k, /** @type {string} */ v) => props.set(k, v) },
    querySelector: () => bar,
  });
  const g = /** @type {any} */ (globalThis);
  const saved = {
    innerWidth: g.innerWidth,
    innerHeight: g.innerHeight,
    raf: g.requestAnimationFrame,
    add: g.addEventListener,
    rm: g.removeEventListener,
  };
  Object.assign(g, {
    innerWidth: 390,
    innerHeight: 844,
    requestAnimationFrame: (/** @type {Function} */ f) => (f(), 1),
    addEventListener() {},
    removeEventListener() {},
  });
  const vv = /** @type {any} */ ({
    scale: 2,
    offsetLeft: 100,
    offsetTop: 300,
    height: 422,
    addEventListener: (/** @type {string} */ k, /** @type {Function} */ f) => (on[k] = f),
    removeEventListener() {},
  });
  const stop = pinNav(host, vv);
  assert.ok(cls.has('pinned'));
  assert.equal(props.get('--pin-x'), '100px');
  assert.equal(props.get('--pin-y'), `${300 + 422 - 844}px`);
  assert.equal(props.get('--pin-s'), '0.5');
  Object.assign(vv, { scale: 1, offsetLeft: 0, offsetTop: 0, height: 844 });
  on.scroll();
  assert.ok(!cls.has('pinned'), 'no transform at normal zoom');
  stop();
  Object.assign(g, {
    innerWidth: saved.innerWidth,
    innerHeight: saved.innerHeight,
    requestAnimationFrame: saved.raf,
    addEventListener: saved.add,
    removeEventListener: saved.rm,
  });
  assert.match(
    comp,
    /#nav\.pinned \.nav \{\n {2}transform: translate\(var\(--pin-x, 0px\), var\(--pin-y, 0px\)\) scale\(var\(--pin-s, 1\)\);/,
  );
});

test('the rest time on the exercise page and sheet uses the translated unit („сек“), not a Latin "s"', () => {
  for (const f of ['src/features/library/technique.js', 'src/features/library/views/detail.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\$\{e\.rest\} s</, f);
    assert.match(src, /\$\{e\.rest\} \$\{t\('unit\.s'\)\}/, f);
  }
  assert.equal(bg['unit.s'], 'сек');
});
