// Opens the documents an entry cites and checks that the numbers in each footnoted
// fact actually appear in them. A fabricated torque value or page shows up as
// "not found". This is a spot-check aid, not proof: OCR can mangle digits, so a
// human still opens the page for anything flagged.
//
// Each number must also sit near its own label in the source (a word from the spec's
// name or value, or for a step the words around the number), so a real number pinned
// to the wrong bolt shows up as "~ not near its label" instead of passing.
//
//   node scripts/check-citations.js                      all non-draft entries
//   node scripts/check-citations.js data/kb/specs/x.json  specific files
// Needs `pdftotext` (poppler) on PATH to read PDF sources. PDFs whose text layer is
// scrambled (Ford's TSBs) are OCR'd if Python has `pymupdf` and `rapidocr-onnxruntime`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadAll, KB_DIR } from '../server/kb.js';

const docCache = new Map();
const UA = { headers: { 'User-Agent': 'Common Manual citation checker (+https://github.com/xsvdevelopment/commonmanual)' } };
const PDFTOTEXT = process.env.PDFTOTEXT || ['C:/Program Files/Git/mingw64/bin/pdftotext.exe'].find((p) => fs.existsSync(p)) || 'pdftotext';
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const OCR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ocr-pdf.py');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch politely; anything but a 2xx is "couldn't read", never "not in source".
async function get(url) {
  await pause(400);
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// Some PDFs (Ford's TSBs, for one) embed fonts whose text layer decodes to gibberish.
// Real English runs 20+ common words per 1,000 characters; gibberish is near 0.
function unreadable(text) {
  const flat = text.replace(/\s+/g, ' ');
  const common = (flat.match(/\b(the|and|to|of|with|for|is|or|be|if|this|on|in)\b/gi) || []).length;
  return flat.length > 1000 && common / (flat.length / 1000) < 2;
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
      if (text !== null && (unreadable(text) || !text.trim())) {
        text = null;
        try { text = execFileSync(PYTHON, [OCR, tmp], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); how = 'PDF OCR'; }
        catch { how += ' (no usable text layer and OCR is not set up: pip install pymupdf rapidocr-onnxruntime, or read the PDF by eye)'; }
      }
      fs.rmSync(tmp, { force: true });
    } else {
      const res = await get(url);
      const body = await res.text();
      text = res.headers.get('content-type')?.includes('json') ? body : body.replace(/<[^>]+>/g, ' ');
      how = 'web page';
    }
  } catch (err) { how = `fetch failed: ${err.message}`; }
  const out = { text: text && ungroup(text.replace(/\s+/g, ' ')), how };
  docCache.set(url, out);
  return out;
}

// Numbers in a fact: "50, then 95" -> 50, 95; "0.009 in" -> 0.009. Dashed identifiers
// like bulletin "07-21-2" stay whole, and also match their undashed form ("07212").
// Thousands separators are dropped on both sides, so "1,600 rpm" matches a source's "1600 rpm".
const ungroup = (s) => String(s).replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
const numbers = (s) => [...new Set(ungroup(s).match(/\d+(?:-\d+){2,}|\d+(?:\.\d+)?/g) || [])];
const forms = (n) => [n, ...(n.startsWith('0.') ? [n.slice(1)] : []), ...(n.includes('-') ? [n.replace(/-/g, '')] : [])];
const pattern = (f) => new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}($|[^0-9])`, 'g');
const found = (n, text) => forms(n).some((f) => pattern(f).test(text));

// Words that say what a number is about; short and generic words don't count.
// Compared on their first 6 letters so "torque" matches "torqued" and "bolts" matches "bolt".
const STOP = new Set(('with from that this then into than they their when what each only used uses also have must more less over '
  + 'under after before about between both does true value values check checks verify make sure while turn turns using step '
  + 'steps once same other first next both every should until install remove replace vehicle vehicles').split(' '));
// Shop abbreviations are short but say a lot about a number.
const SHORT = new Set('tsb dtc rpm psi atf ecm pcm tcm egr pcv vin awd 4wd 2wd abs bcm iwe mph kpa'.split(' '));
// Hyphenated names split into their parts: "frame-to-door" gives "frame" and "door".
const words = (s) => [...new Set((String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || [])
  .filter((w) => /[a-z]/.test(w) && (w.length > 3 || SHORT.has(w)) && !STOP.has(w))
  .map((w) => w.replace(/s$/, '').slice(0, 6)))];
// Long numbers (part numbers, VIN fragments, dates) are distinctive enough on their own.
const needsLabel = (n) => n.replace(/[.-]/g, '').length < 5;
// Codes that carry their own label (P0365, L82, PIP5847B, 19-2392): if the whole code is in
// the source, the numbers inside it don't need a nearby word.
const codes = (s) => (ungroup(s).match(/\b(?:[A-Za-z]+\d+[A-Za-z0-9]*|\d+(?:\.\d+)?[A-Za-z]+[A-Za-z0-9]*|\d{2,}-\d{3,})\b/g) || []);
function selfLabeled(n, fact, text) {
  const low = text.toLowerCase();
  return codes(fact.text).some((c) => c.includes(n) && low.includes(c.toLowerCase()));
}
function nearLabel(n, text, label) {
  if (!label.length) return true;
  const low = text.toLowerCase();
  for (const f of forms(n)) {
    for (const m of text.matchAll(pattern(f))) {
      const near = low.slice(Math.max(0, m.index - 300), m.index + 300);
      if (label.some((w) => near.includes(w))) return true;
    }
  }
  return false;
}
// A spec's label is its name plus the words in its value; a step's is the words within
// 60 characters of the number.
function labelFor(fact, n) {
  if (!fact.step) return words(`${fact.label} ${fact.text}`);
  const t = ungroup(fact.text);
  const i = Math.max(0, t.indexOf(n));
  return words(t.slice(Math.max(0, i - 60), i + n.length + 60));
}

const files = process.argv.slice(2).map((f) => path.resolve(f));
const { entries } = await loadAll();
const targets = entries.filter((e) => e.status !== 'draft' && (!files.length || files.includes(path.join(KB_DIR, e.file))));

let flagged = 0;
let loose = 0;
const lines = [];
for (const e of targets) {
  lines.push(`\n### ${e.id}`);
  const facts = [
    ...(e.specs || []).map((s) => ({ label: s.name, text: `${s.value} ${s.unit || ''}`, src: s.src })),
    ...(e.steps || []).filter((s) => typeof s === 'object').map((s, i) => ({ label: `step ${i + 1}`, text: s.text, src: s.src, t: s.t, step: true })),
  ];
  for (const f of facts) {
    const nums = numbers(f.text);
    if (!nums.length) continue;
    const cited = (f.src || []).map((k) => e.sources[k - 1]).filter(Boolean);
    if (cited.some((s) => s.type === 'video')) { lines.push(`- ? ${f.label}: cites a video${f.t ? ` at ${f.t}` : ''}. Watch that moment to confirm.`); continue; }
    const docs = await Promise.all(cited.filter((s) => s.url).map((s) => fetchText(s.url)));
    const readable = docs.filter((d) => d.text);
    if (!readable.length) { lines.push(`- ? ${f.label}: source not machine-readable (${docs.map((d) => d.how).join('; ') || 'no URL'}). Check by hand.`); continue; }
    const ocr = readable.some((d) => d.how === 'PDF OCR') ? ' (OCR)' : '';
    const missing = nums.filter((n) => !readable.some((d) => found(n, d.text)));
    if (missing.length) { flagged++; lines.push(`- ✗ ${f.label}: ${missing.join(', ')} not found in the cited source${ocr}. Open it and check.`); continue; }
    const astray = nums.filter(needsLabel).filter((n) => !readable.some((d) => selfLabeled(n, f, d.text) || nearLabel(n, d.text, labelFor(f, n))));
    if (astray.length) { loose++; lines.push(`- ~ ${f.label}: ${astray.join(', ')} found${ocr}, but not near its label in the source. Make sure it belongs to this item.`); continue; }
    lines.push(`- ✓ ${f.label}${ocr}`);
  }
}
const report = `## Citation spot-check\n${targets.length} entries checked, ${flagged} fact(s) flagged, ${loose} found but not near their label.\n${lines.join('\n')}\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
