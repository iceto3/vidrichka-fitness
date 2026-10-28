/**
 * Export the built-in food list for the shared Google Sheet (run at go-live, the app never
 * reads the sheet):
 *   node tools/export-foods.mjs                → docs/foods.csv (every food)
 *   node tools/export-foods.mjs --since <ref>  → also docs/foods-changes.csv (new / changed rows vs
 *                                                that git ref, e.g. main = the live 1.3.4 list)
 * Columns: id, category, name_bg, name_en, kcal, protein, carbs, fat, fiber, salt, portion_g.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const COLS = ['id', 'cat', 'bg', 'en', 'kcal', 'p', 'c', 'f', 'fib', 'salt', 'portion'];
const HEAD = 'id,category,name_bg,name_en,kcal,protein,carbs,fat,fiber,salt,portion_g';
/** @param {unknown} v */
const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
/** @param {any} f */
const flat = (f) => ({ ...f, bg: f.name.bg, en: f.name.en });
/** @param {any} f */
const line = (f) => COLS.map((k) => cell(f[k])).join(',');

const { FOODS } = await import(pathToFileURL(join(process.cwd(), 'src/data/foods.js')).href);
const now = FOODS.map(flat);
writeFileSync('docs/foods.csv', [HEAD, ...now.map(line)].join('\n') + '\n');
console.log(`docs/foods.csv: ${now.length} foods`);

const i = process.argv.indexOf('--since');
if (i > 0) {
  const ref = process.argv[i + 1];
  const dir = mkdtempSync(join(tmpdir(), 'foods-'));
  writeFileSync(join(dir, 'foods.mjs'), execFileSync('git', ['show', `${ref}:src/data/foods.js`]));
  const old = new Map(
    (await import(pathToFileURL(join(dir, 'foods.mjs')).href)).FOODS.map((/** @type {any} */ f) => [f.id, flat(f)]),
  );
  const rows = now.flatMap((f) => {
    const o = old.get(f.id);
    if (!o) return [`new,${line(f)},`];
    const diff = COLS.filter((k) => String(o[k]) !== String(f[k]));
    return diff.length ? [`changed,${line(f)},${cell(diff.map((k) => `${k}: ${o[k]} → ${f[k]}`).join('; '))}`] : [];
  });
  writeFileSync('docs/foods-changes.csv', [`change,${HEAD},was`, ...rows].join('\n') + '\n');
  console.log(`docs/foods-changes.csv: ${rows.length} rows vs ${ref}`);
}
