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
  }
  if (e.type === 'procedure' && !(e.steps || []).length) errs.push('steps: a procedure needs steps');
  if (e.type === 'spec' && !(e.specs || []).length) errs.push('specs: a spec sheet needs specs');
  for (const [i, s] of (e.specs || []).entries()) {
    if (!s.name || s.value === undefined || s.value === '') errs.push(`specs[${i}]: name and value required`);
  }
  if (!Array.isArray(e.sources)) errs.push('sources: list of citations');
  for (const [i, s] of (e.sources || []).entries()) {
    if (!s.title) errs.push(`sources[${i}].title: required`);
  }
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
  for (const [i, s] of (e.steps || []).entries()) {
    if (typeof s === 'object' && s.src !== undefined && badRef(s.src)) errs.push(`steps[${i}]: src points at a missing source`);
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
    return true;
  });
}

const isGeneric = (e) => e.applies.every((a) => a.make === '*');

let loaded = null;

async function readTree(dir) {
  const out = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await readTree(p)));
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
