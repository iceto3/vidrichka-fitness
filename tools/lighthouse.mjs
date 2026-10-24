/**
 * Lighthouse audit of the production build (mobile, simulated throttling).
 * Serves `dist/` locally, runs Lighthouse with the system Chrome and writes HTML/JSON
 * reports to `.lighthouse/`. Run `npm run build` first.
 * Usage: `npm run lighthouse` (CHROME_PATH overrides the browser).
 * @module tools/lighthouse
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8899;
const server = spawn(process.execPath, ['tools/serve.mjs', String(port), 'dist'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
await mkdir(`${root}.lighthouse`, { recursive: true });
const chrome = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const code = await new Promise((res) => {
  const p = spawn(
    'npx',
    [
      'lighthouse',
      `http://localhost:${port}/`,
      '--quiet',
      '--output=json',
      '--output=html',
      `--output-path=${root}.lighthouse/report`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { cwd: root, stdio: 'inherit', env: { ...process.env, CHROME_PATH: chrome } },
  );
  p.on('exit', res);
});
server.kill();
if (code !== 0) process.exit(Number(code) || 1);
const r = JSON.parse(await readFile(`${root}.lighthouse/report.report.json`, 'utf8'));
for (const [k, c] of Object.entries(r.categories)) console.log(`${k.padEnd(15)} ${Math.round(c.score * 100)}`);
for (const id of [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
])
  console.log(`${id.padEnd(26)} ${r.audits[id].displayValue}`);
const fails = Object.values(r.audits).filter(
  (a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'binary',
);
if (fails.length) console.log('Failed audits:', fails.map((a) => a.id).join(', '));
