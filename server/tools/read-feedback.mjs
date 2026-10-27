#!/usr/bin/env node
// Download in-app feedback (1.3.4) from D1 into a folder: one sub-folder per message with
// message.txt (text, version, language, time) and its screenshots (shot-1.jpg …).
// Usage (from server/, with CLOUDFLARE_API_TOKEN set):
//   node tools/read-feedback.mjs [--out /workspace/feedback] [--after <id>] [--local]
// Uses `wrangler d1 execute` (read-only SELECTs); nothing is deleted.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const out = arg('--out', '/workspace/feedback');
const after = Number(arg('--after', '0')) || 0;
const where = process.argv.includes('--local') ? '--local' : '--remote';

/** @param {string} sql */
function q(sql) {
  const raw = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'vidrichka-push-db', where, '--json', '--command', sql],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const j = JSON.parse(raw.slice(raw.indexOf('[')));
  return j[0]?.results ?? [];
}

const rows = q(
  `SELECT f.id, f.text, f.version, f.lang, f.created_at, (SELECT COUNT(*) FROM feedback_images i WHERE i.feedback_id = f.id) AS shots
   FROM feedback f WHERE f.id > ${after} ORDER BY f.id`,
);
mkdirSync(out, { recursive: true });
for (const r of rows) {
  const dir = join(out, String(r.id).padStart(4, '0'));
  mkdirSync(dir, { recursive: true });
  const when = new Date(r.created_at).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });
  writeFileSync(
    join(dir, 'message.txt'),
    `#${r.id} · v${r.version} · ${r.lang} · ${when} (Europe/Sofia)\n\n${r.text}\n`,
  );
  for (let i = 0; i < r.shots; i++) {
    const [img] = q(`SELECT mime, hex(data) AS hex FROM feedback_images WHERE feedback_id = ${r.id} AND idx = ${i}`);
    if (!img) continue;
    const ext = img.mime === 'image/png' ? 'png' : img.mime === 'image/webp' ? 'webp' : 'jpg';
    writeFileSync(join(dir, `shot-${i + 1}.${ext}`), Buffer.from(img.hex, 'hex'));
  }
  console.log(
    `#${r.id}  ${when}  v${r.version}  ${r.lang}  ${r.shots} shot(s)  ${r.text.slice(0, 70).replace(/\n/g, ' ')}`,
  );
}
console.log(rows.length ? `\n${rows.length} message(s) saved to ${out}` : 'No new feedback.');
