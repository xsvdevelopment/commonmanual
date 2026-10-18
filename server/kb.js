// The shared knowledge base: one JSON file per entry under data/kb/.
// Plain files keep contributions reviewable as ordinary pull requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA } from './paths.js';

export const KB_DIR = path.join(DATA, 'kb');
export const TYPES = ['procedure', 'spec', 'known-issue', 'source'];
// draft: not yet backed by a citation, hidden unless the viewer asks for drafts.
// cited: every spec carries a footnote to a listed source.
// shop-verified: cited, and confirmed on a real vehicle by a named shop.
// factory-sourced: cited to the manufacturer's own service documentation.
export const STATUSES = ['draft', 'cited', 'shop-verified', 'factory-sourced'];
const THIS_YEAR = new Date().getFullYear() + 1;

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function validateEntry(e) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['entry must be an object'];
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(e.id || '')) errs.push('id: lowercase letters, digits and dashes, 3-80 chars');
  if (!TYPES.includes(e.type)) errs.push(`type: one of ${TYPES.join(', ')}`);
  if (!e.title || String(e.title).length < 4) errs.push('title: required');
  if (!STATUSES.includes(e.status)) errs.push(`status: one of ${STATUSES.join(', ')}`);
  if (!Array.isArray(e.applies) || !e.applies.length) errs.push('applies: at least one vehicle range');
  for (const [i, a] of (e.applies || []).entries()) {
    if (!a.make) errs.push(`applies[${i}].make: required ("*" for any make)`);
    const [from, to] = a.years || [];
    if (!(from >= 1900 && to <= THIS_YEAR && from <= to)) errs.push(`applies[${i}].years: [from, to] between 1900 and ${THIS_YEAR}`);
    if (a.models && !Array.isArray(a.models)) errs.push(`applies[${i}].models: list of model names`);
    if (a.exclude && !Array.isArray(a.exclude)) errs.push(`applies[${i}].exclude: list of model names to leave out`);
  }
  if (e.type === 'procedure' && !(e.steps || []).length) errs.push('steps: a procedure needs steps');
  if (e.type === 'spec' && !(e.specs || []).length) errs.push('specs: a spec sheet needs specs');
  for (const [i, s] of (e.specs || []).entries()) {
    if (!s.name || s.value === undefined || s.value === '') errs.push(`specs[${i}]: name and value required`);
  }
  for (const [i, p] of (e.photos || []).entries()) {
    if (!/^media\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|png|webp)$/.test(p.file || '')) errs.push(`photos[${i}].file: must be media/<entry-id>/<name>.jpg`);
    if (!p.caption) errs.push(`photos[${i}].caption: required`);
    if (!p.credit) errs.push(`photos[${i}].credit: who took it (only your own photos)`);
    if (p.step !== undefined && !(Number.isInteger(p.step) && p.step >= 1 && p.step <= (e.steps || []).length)) errs.push(`photos[${i}].step: must be a step number`);
  }
  if (!Array.isArray(e.sources)) errs.push('sources: list of citations');
  for (const [i, s] of (e.sources || []).entries()) {
    if (!s.title) errs.push(`sources[${i}].title: required`);
    if (s.type === 'video' && (!s.url || !s.creator)) errs.push(`sources[${i}]: a video source needs url and creator (channel name)`);
  }
  const isVideo = (k) => e.sources?.[k - 1]?.type === 'video';
  for (const [i, s] of (e.steps || []).entries()) {
    if (typeof s !== 'object' || s.t === undefined) continue;
    if (!/^(\d+:)?\d{1,2}:\d{2}$/.test(s.t)) errs.push(`steps[${i}].t: timestamp like 4:32 or 1:04:32`);
    if (!(s.src || []).some(isVideo)) errs.push(`steps[${i}].t: a timestamp needs a video source in src`);
  }
  if (e.status === 'factory-sourced' && (e.sources || []).some((s) => s.type === 'video')) errs.push('status: entries citing videos are "cited", not "factory-sourced"');
  if (e.status !== 'draft') errs.push(...citationErrors(e));
  return errs;
}

// Anything published as fact must be footnoted: at least one source, and every
// spec (and any step that cites) must point at a real source number (1-based).
export function citationErrors(e) {
  const errs = [];
  const n = (e.sources || []).length;
  if (!n) return ['sources: a non-draft entry needs at least one citation'];
  const badRef = (src) => !Array.isArray(src) || !src.length || src.some((k) => !(Number.isInteger(k) && k >= 1 && k <= n));
  for (const [i, s] of (e.specs || []).entries()) {
    if (badRef(s.src)) errs.push(`specs[${i}] "${s.name}": needs src footnote(s) pointing at sources 1-${n}`);
  }
  // Every published step must be footnoted too; facts in a procedure live in its steps.
  for (const [i, s] of (e.steps || []).entries()) {
    if (typeof s !== 'object' || badRef(s.src)) errs.push(`steps[${i}]: needs src footnote(s) pointing at sources 1-${n} (end the line with [1] in the form)`);
  }
  if (e.status === 'shop-verified' && !e.verifiedBy) errs.push('verifiedBy: name the shop that confirmed it');
  return errs;
}

export function applies(entry, { year, make, model }) {
  const y = Number(year);
  return entry.applies.some((a) => {
    if (a.make !== '*' && norm(a.make) !== norm(make)) return false;
    if (y < a.years[0] || y > a.years[1]) return false;
    if (a.models?.length && model && !a.models.some((m) => norm(model).includes(norm(m)))) return false;
    // "ROGUE" also matches "ROGUE SPORT"; exclude carves those out.
    if (a.exclude?.length && model && a.exclude.some((m) => norm(model).includes(norm(m)))) return false;
    return true;
  });
}

const isGeneric = (e) => e.applies.every((a) => a.make === '*');

let loaded = null;

async function readTree(dir) {
  const out = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory() && d.name !== 'media') out.push(...(await readTree(p)));
    else if (d.name.endsWith('.json')) out.push(p);
  }
  return out;
}

export async function loadAll({ fresh = false } = {}) {
  if (loaded && !fresh) return loaded;
  const files = await readTree(KB_DIR);
  const entries = [];
  const problems = [];
  for (const f of files) {
    try {
      const e = JSON.parse(await fs.readFile(f, 'utf8'));
      const errs = validateEntry(e);
      if (errs.length) problems.push({ file: path.relative(KB_DIR, f), errs });
      else entries.push({ ...e, generic: isGeneric(e), file: path.relative(KB_DIR, f).replaceAll('\\', '/') });
    } catch (err) {
      problems.push({ file: path.relative(KB_DIR, f), errs: [err.message] });
    }
  }
  loaded = { entries, problems };
  return loaded;
}

const visible = (e, drafts) => drafts || e.status !== 'draft';

export async function forVehicle(v, { drafts = false } = {}) {
  const { entries } = await loadAll();
  return entries
    .filter((e) => visible(e, drafts) && applies(e, v))
    .sort((a, b) => a.generic - b.generic || a.title.localeCompare(b.title));
}

export async function search(text, { drafts = false } = {}) {
  const entries = (await loadAll()).entries.filter((e) => visible(e, drafts));
  const terms = norm(text) ? String(text).toLowerCase().split(/\s+/).filter(Boolean) : [];
  if (!terms.length) return [];
  const hay = (e) =>
    [e.title, e.summary, e.body, ...(e.tags || []), ...(e.steps || []).map((s) => (typeof s === 'string' ? s : s.text)),
      ...(e.specs || []).map((s) => s.name), ...e.applies.map((a) => `${a.make} ${(a.models || []).join(' ')} ${a.engine || ''}`)]
      .join(' ')
      .toLowerCase();
  return entries
    .map((e) => {
      const h = hay(e);
      const t = e.title.toLowerCase();
      if (!terms.every((x) => h.includes(x))) return null;
      return { e, score: terms.filter((x) => t.includes(x)).length };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.e);
}

export async function get(id) {
  const { entries } = await loadAll();
  return entries.find((e) => e.id === id) || null;
}

export const MEDIA_DIR = path.join(KB_DIR, 'media');

const MAGIC = [
  ['jpg', [0xff, 0xd8, 0xff]],
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['webp', [0x52, 0x49, 0x46, 0x46]],
];

// Stores one photo for an entry; returns its path relative to data/kb.
export async function savePhoto(entryId, buf) {
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(entryId)) return { error: 'bad entry id' };
  const ext = MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  if (!ext) return { error: 'only JPEG, PNG or WebP images' };
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const dir = path.join(MEDIA_DIR, entryId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);
  return { file: `media/${entryId}/${name}` };
}

// New entries from the shop land in data/kb/shop/ for review before a pull request.
export async function save(entry) {
  const errs = validateEntry(entry);
  if (errs.length) return { errs };
  const { entries } = await loadAll();
  const existing = entries.find((e) => e.id === entry.id);
  const rel = existing ? existing.file : `shop/${entry.id}.json`;
  const file = path.join(KB_DIR, rel);
  const { generic, file: _f, ...clean } = entry;
  clean.updated = new Date().toISOString().slice(0, 10);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(clean, null, 2) + '\n');
  await loadAll({ fresh: true });
  return { saved: rel };
}
