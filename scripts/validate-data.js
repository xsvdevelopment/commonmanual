// Checks every knowledge-base file before it can be merged.
// Run: npm run validate   (CI runs this on every pull request)
import { loadAll } from '../server/kb.js';

const { entries, problems } = await loadAll();
const ids = new Map();
for (const e of entries) {
  if (ids.has(e.id)) problems.push({ file: e.file, errs: [`duplicate id "${e.id}" (also in ${ids.get(e.id)})`] });
  ids.set(e.id, e.file);
  if (!e.file.endsWith(`/${e.id}.json`)) problems.push({ file: e.file, errs: [`file name must match id: ${e.id}.json`] });
}

const drafts = entries.filter((e) => e.status === 'draft').length;
console.log(`${entries.length} entries (${entries.length - drafts} cited, ${drafts} drafts awaiting citations)`);
if (problems.length) {
  for (const p of problems) console.error(`\n✗ data/kb/${p.file}\n  - ${p.errs.join('\n  - ')}`);
  process.exit(1);
}
console.log('✓ all entries valid');
