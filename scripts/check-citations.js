// Opens the documents an entry cites and checks that the numbers in each footnoted
// fact actually appear in them. A fabricated torque value or page shows up as
// "not found". This is a spot-check aid, not proof: OCR can mangle digits, so a
// human still opens the page for anything flagged.
//
//   node scripts/check-citations.js                      all non-draft entries
//   node scripts/check-citations.js data/kb/specs/x.json  specific files
// Needs `pdftotext` (poppler) on PATH to read PDF sources.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadAll, KB_DIR } from '../server/kb.js';

const docCache = new Map();
const UA = { headers: { 'User-Agent': 'OpenBay citation checker (+https://github.com/xsvdevelopment/openbay)' } };
const PDFTOTEXT = process.env.PDFTOTEXT || ['C:/Program Files/Git/mingw64/bin/pdftotext.exe'].find((p) => fs.existsSync(p)) || 'pdftotext';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch politely; anything but a 2xx is "couldn't read", never "not in source".
async function get(url) {
  await pause(400);
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function fetchText(url) {
  if (docCache.has(url)) return docCache.get(url);
  let text = null;
  let how = '';
  try {
    const ia = url.match(/archive\.org\/details\/([^/?#]+)/);
    if (ia) {
      const meta = await (await get(`https://archive.org/metadata/${ia[1]}`)).json();
      const f = (meta.files || []).find((x) => x.name.endsWith('_djvu.txt'));
      if (f) { text = await (await get(`https://archive.org/download/${ia[1]}/${encodeURIComponent(f.name)}`)).text(); how = 'archive.org OCR text'; }
    } else if (/\.pdf($|\?)/i.test(url)) {
      const buf = Buffer.from(await (await get(url)).arrayBuffer());
      const tmp = path.join(os.tmpdir(), `openbay-cite-${Date.now()}.pdf`);
      fs.writeFileSync(tmp, buf);
      try { text = execFileSync(PDFTOTEXT, ['-layout', tmp, '-'], { maxBuffer: 64 << 20 }).toString(); how = 'PDF text'; }
      catch { how = 'PDF (pdftotext not installed, skipped)'; }
      fs.rmSync(tmp, { force: true });
    } else {
      const res = await get(url);
      const body = await res.text();
      text = res.headers.get('content-type')?.includes('json') ? body : body.replace(/<[^>]+>/g, ' ');
      how = 'web page';
    }
  } catch (err) { how = `fetch failed: ${err.message}`; }
  // Some PDFs (Ford's TSBs, for one) embed fonts whose text layer decodes to gibberish.
  // Real English runs 20+ common words per 1,000 characters; gibberish is near 0.
  if (text && how === 'PDF text') {
    const flat = text.replace(/\s+/g, ' ');
    const common = (flat.match(/\b(the|and|to|of|with|for|is|or|be|if|this|on|in)\b/gi) || []).length;
    if (flat.length > 1000 && common / (flat.length / 1000) < 2) { text = null; how += ' (text layer is unreadable, likely an embedded font; read the PDF by eye)'; }
  }
  const out = { text: text && ungroup(text.replace(/\s+/g, ' ')), how };
  docCache.set(url, out);
  return out;
}

// Numbers in a fact: "50, then 95" -> 50, 95; "0.009 in" -> 0.009. Dashed identifiers
// like bulletin "07-21-2" stay whole, and also match their undashed form ("07212").
// Thousands separators are dropped on both sides, so "1,600 rpm" matches a source's "1600 rpm".
const ungroup = (s) => String(s).replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
const numbers = (s) => [...new Set(ungroup(s).match(/\d+(?:-\d+){2,}|\d+(?:\.\d+)?/g) || [])];
function found(n, text) {
  const forms = [n];
  if (n.startsWith('0.')) forms.push(n.slice(1));
  if (n.includes('-')) forms.push(n.replace(/-/g, ''));
  return forms.some((f) => new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}($|[^0-9])`).test(text));
}

const files = process.argv.slice(2).map((f) => path.resolve(f));
const { entries } = await loadAll();
const targets = entries.filter((e) => e.status !== 'draft' && (!files.length || files.includes(path.join(KB_DIR, e.file))));

let flagged = 0;
const lines = [];
for (const e of targets) {
  lines.push(`\n### ${e.id}`);
  const facts = [
    ...(e.specs || []).map((s) => ({ label: s.name, text: `${s.value} ${s.unit || ''}`, src: s.src })),
    ...(e.steps || []).filter((s) => typeof s === 'object').map((s, i) => ({ label: `step ${i + 1}`, text: s.text, src: s.src, t: s.t })),
  ];
  for (const f of facts) {
    const nums = numbers(f.text);
    if (!nums.length) continue;
    const cited = (f.src || []).map((k) => e.sources[k - 1]).filter(Boolean);
    if (cited.some((s) => s.type === 'video')) { lines.push(`- ? ${f.label}: cites a video${f.t ? ` at ${f.t}` : ''}. Watch that moment to confirm.`); continue; }
    const docs = await Promise.all(cited.filter((s) => s.url).map((s) => fetchText(s.url)));
    const readable = docs.filter((d) => d.text);
    if (!readable.length) { lines.push(`- ? ${f.label}: source not machine-readable (${docs.map((d) => d.how).join('; ') || 'no URL'}). Check by hand.`); continue; }
    const missing = nums.filter((n) => !readable.some((d) => found(n, d.text)));
    if (missing.length) { flagged++; lines.push(`- ✗ ${f.label}: ${missing.join(', ')} not found in the cited source. Open it and check.`); }
    else lines.push(`- ✓ ${f.label}`);
  }
}
const report = `## Citation spot-check\n${targets.length} entries checked, ${flagged} fact(s) flagged.\n${lines.join('\n')}\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
