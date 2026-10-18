// List NHTSA manufacturer bulletins (TSBs) for a vehicle, optionally filtered, with PDF links.
//   node scripts/bulletins.js 2013 FORD "F-150 SUPER CREW" phaser
//   node scripts/bulletins.js 2010 CHEVROLET "SILVERADO 1500" "oil consumption"
// The model must match NHTSA's naming; list names with: node scripts/bulletins.js 2013 FORD
import { models, bulletins, bulletinDocs } from '../server/sources/nhtsa.js';

const [year, make, model, ...words] = process.argv.slice(2);
if (!year || !make) {
  console.log('usage: node scripts/bulletins.js <year> <MAKE> ["<MODEL>"] [keyword...]');
  process.exit(1);
}
if (!model) {
  console.log((await models(year, make.toUpperCase())).join('\n'));
  process.exit(0);
}

const re = words.length ? new RegExp(words.join(' '), 'i') : null;
const { tsbs, investigations } = await bulletins(year, make.toUpperCase(), model.toUpperCase());
const hits = tsbs.filter((t) => !re || re.test(`${t.number} ${t.summary}`));
console.log(`${hits.length} of ${tsbs.length} bulletins${re ? ` matching /${re.source}/i` : ''}\n`);
for (const t of hits) {
  const docs = t.docs ? (await bulletinDocs('tsb', t.id)).map((d) => d.url).join(' ') : '(summary only, no document on file)';
  console.log(`${t.number} | NHTSA ${t.id} | ${t.date}\n  ${t.summary.replace(/\s+/g, ' ')}\n  ${docs}\n`);
}
if (investigations.length) console.log(`Also ${investigations.length} NHTSA defect investigation(s): ${investigations.map((i) => `${i.id} ${i.subject}`).join('; ')}`);
