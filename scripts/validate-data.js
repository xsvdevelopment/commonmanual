// Checks every knowledge-base file before it can be merged.
// Run: npm run validate   (CI runs this on every pull request)
import fs from 'node:fs';
import path from 'node:path';
import { loadAll, KB_DIR } from '../server/kb.js';

const { entries, problems } = await loadAll();
const ids = new Map();
for (const e of entries) {
  if (ids.has(e.id)) problems.push({ file: e.file, errs: [`duplicate id "${e.id}" (also in ${ids.get(e.id)})`] });
  ids.set(e.id, e.file);
  if (!e.file.endsWith(`/${e.id}.json`)) problems.push({ file: e.file, errs: [`file name must match id: ${e.id}.json`] });
  for (const p of e.photos || []) {
    if (!p.file.startsWith(`media/${e.id}/`)) problems.push({ file: e.file, errs: [`photo ${p.file} must live in media/${e.id}/`] });
    else if (!fs.existsSync(path.join(KB_DIR, p.file))) problems.push({ file: e.file, errs: [`photo missing on disk: ${p.file}`] });
    else if (fs.statSync(path.join(KB_DIR, p.file)).size > 1_500_000) problems.push({ file: e.file, errs: [`photo over 1.5 MB, resize it: ${p.file}`] });
  }
}

const drafts = entries.filter((e) => e.status === 'draft').length;
console.log(`${entries.length} entries (${entries.length - drafts} cited, ${drafts} drafts awaiting citations)`);
if (problems.length) {
  for (const p of problems) console.error(`\n✗ data/kb/${p.file}\n  - ${p.errs.join('\n  - ')}`);
  process.exit(1);
}
console.log('✓ all entries valid');
