/**
 * Production build: bundles and code-splits the app into `dist/` for static hosting
 * (GitHub Pages subpaths work because every URL stays relative).
 *
 * - JS: esbuild, ESM with code splitting (each feature view is its own lazy chunk),
 *   minified, content-hashed file names.
 * - CSS: `src/app.css` and its @imports bundled into one hashed file; fonts are hashed too.
 * - index.html is rewritten to point at the hashed files; static assets are copied.
 * - sw.js gets a VERSION (package version + content hash) and the full PRECACHE list,
 *   which switches it to cache-first and lets the update prompt detect new releases.
 *
 * Usage: `npm run build` (then `node tools/serve.mjs 8080 dist` to preview).
 *        `npm run build:beta` (= `--beta`) builds the beta channel into `dist-beta/`: its own
 *        IndexedDB/localStorage/cache names and servers (src/core/channel.js), a "БЕТА" marker,
 *        `noindex`, and a VERSION like `1.4.0-beta-<hash>`.
 * @module tools/build
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const BETA = process.argv.includes('--beta');
const CHANNEL = BETA ? 'beta' : 'live';
const out = join(root, BETA ? 'dist-beta' : 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const common = /** @type {const} */ ({
  bundle: true,
  minify: true,
  metafile: true,
  logLevel: 'warning',
  absWorkingDir: root,
});

const js = await build({
  ...common,
  entryPoints: ['src/main.js'],
  outdir: join(out, 'js'),
  format: 'esm',
  splitting: true,
  target: ['es2022', 'safari16.4', 'chrome109'],
  entryNames: '[name]-[hash]',
  chunkNames: 'c/[name]-[hash]',
  define: {
    'globalThis.__APP_VERSION__': JSON.stringify(pkg.version),
    'globalThis.__APP_CHANNEL__': JSON.stringify(CHANNEL),
  },
  legalComments: 'none',
});

const css = await build({
  ...common,
  entryPoints: ['src/app.css'],
  outdir: join(out, 'css'),
  entryNames: '[name]-[hash]',
  assetNames: '../fonts/[name]-[hash]',
  loader: { '.woff2': 'file' },
  target: ['safari16.4', 'chrome109'],
});

/** Output path (relative to dist) of the entry whose source is `src`. */
const entryOut = (/** @type {import('esbuild').Metafile} */ meta, /** @type {string} */ src) =>
  relative(
    out,
    join(root, /** @type {string} */ (Object.entries(meta.outputs).find(([, o]) => o.entryPoint === src)?.[0])),
  );
const mainJs = entryOut(js.metafile, 'src/main.js');
const appCss = entryOut(css.metafile, 'src/app.css');
const latinFont = relative(
  out,
  join(root, /** @type {string} */ (Object.keys(css.metafile.outputs).find((f) => f.includes('PlusJakartaSans')))),
);

await cp(join(root, 'assets/icons'), join(out, 'assets/icons'), { recursive: true });
await cp(join(root, 'assets/vendor'), join(out, 'assets/vendor'), { recursive: true });
await cp(join(root, 'assets/sounds'), join(out, 'assets/sounds'), { recursive: true }); // celebration sounds (precached)
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (BETA) Object.assign(manifest, { name: 'Vidrichka Fitness БЕТА', short_name: 'Vidrichka β' });
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

let index = await readFile(join(root, 'index.html'), 'utf8');
index = index
  .replace('href="src/app.css"', `href="${appCss}"`)
  .replace('src="src/main.js"', `src="${mainJs}"`)
  .replace('href="assets/fonts/PlusJakartaSans-latin.woff2"', `href="${latinFont}"`)
  .replace('</head>', `<link rel="modulepreload" href="${mainJs}">\n</head>`);
if (BETA)
  index = index
    .replace("localStorage.getItem('vf-theme'", "localStorage.getItem('vfb-theme'")
    .replace("var P = 'vf-';", "var P = 'vfb-';")
    .replace(
      '<title>Vidrichka Fitness</title>',
      '<title>Vidrichka Fitness БЕТА</title>\n<meta name="robots" content="noindex">',
    );
if (!index.includes(`var P = '${BETA ? 'vfb-' : 'vf-'}';`)) throw new Error('index.html heal prefix not found');
await writeFile(join(out, 'index.html'), index);
await writeFile(join(out, '.nojekyll'), '');

/** @returns {Promise<string[]>} all files under dir, relative to dist */
async function walk(dir = out) {
  const res = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) res.push(...(await walk(p)));
    else res.push(relative(out, p));
  }
  return res;
}

// Precache everything the app can need offline. Splash screens are only read by iOS at
// install time and the zxing fallback is cached on first use (barcode lookups need the
// network anyway), so both are left out to keep the first install small.
const files = (await walk()).filter((f) => !/splash-|vendor\/|\.nojekyll|build-report/.test(f)).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(await readFile(join(out, f)));
const version = `${pkg.version}${BETA ? '-beta' : ''}-${hash.digest('hex').slice(0, 10)}`;
const precache = ['./', ...files];
const sw = (await readFile(join(root, 'sw.js'), 'utf8'))
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`)
  .replace("const CHANNEL = 'live';", `const CHANNEL = '${CHANNEL}';`);
if (!sw.includes(version)) throw new Error('sw.js VERSION placeholder not found');
if (!sw.includes(`const CHANNEL = '${CHANNEL}';`)) throw new Error('sw.js CHANNEL placeholder not found');
await writeFile(join(out, 'sw.js'), sw);

// Size report
const size = async (/** @type {string} */ f) => {
  const buf = await readFile(join(out, f));
  return { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
};
const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} kB`;
const jsFiles = files.filter((f) => f.startsWith('js/'));
const initial = [
  mainJs,
  ...(Object.entries(js.metafile.outputs)
    .find(([k]) => k.endsWith(mainJs))?.[1]
    .imports.filter((i) => i.kind === 'import-statement')
    .map((i) => relative(out, join(root, i.path))) ?? []),
];
const tot = { raw: 0, gz: 0 },
  init = { raw: 0, gz: 0 };
for (const f of jsFiles) {
  const s = await size(f);
  tot.raw += s.raw;
  tot.gz += s.gz;
  if (initial.includes(f)) {
    init.raw += s.raw;
    init.gz += s.gz;
  }
}
const c = await size(appCss);
const report = {
  version,
  jsChunks: jsFiles.length,
  initialJs: { files: initial.length, raw: init.raw, gzip: init.gz },
  allJs: { raw: tot.raw, gzip: tot.gz },
  css: { raw: c.raw, gzip: c.gz },
  precacheFiles: precache.length,
  precacheBytes: (await Promise.all(files.map((f) => stat(join(out, f)).then((s) => s.size)))).reduce(
    (a, b) => a + b,
    0,
  ),
};
await writeFile(join(out, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(`Built ${version} → ${relative(root, out)}/
  JS initial: ${kb(init.raw)} (${kb(init.gz)} gzip) in ${initial.length} file(s)
  JS total:   ${kb(tot.raw)} (${kb(tot.gz)} gzip) in ${jsFiles.length} chunks
  CSS:        ${kb(c.raw)} (${kb(c.gz)} gzip)
  Precache:   ${precache.length} entries, ${kb(report.precacheBytes)}`);
