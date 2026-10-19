// "Here's the problem on this car": ranks everything documented for the vehicle
// (factory bulletins, cited knowledge, recalls, investigations, owner reports) by
// how well it matches the described symptom. Pure retrieval over sourced records;
// nothing here writes or guesses an answer.
import * as nhtsa from './sources/nhtsa.js';
import * as kb from './kb.js';
import { lookup as dtcLookup } from './dtc.js';

// Shop words that mean the same thing. Each group is one "concept".
const GROUPS = [
  ['rattle', 'tick', 'tap', 'knock', 'clatter', 'chatter', 'ping'],
  ['clunk', 'thump', 'bang', 'pop', 'clank'],
  ['squeal', 'squeak', 'chirp', 'screech'],
  ['grind', 'growl', 'scrape'],
  ['whine', 'hum', 'howl', 'drone', 'buzz', 'whistle'],
  ['noise', 'sound', 'noisy'],
  ['stall', 'dies', 'die', 'quit', 'shut off', 'shuts off', 'cut out', 'cuts out'],
  ['no start', 'wont start', "won't start", 'not start', 'crank no start', 'hard start', 'no crank'],
  ['misfire', 'rough idle', 'runs rough', 'stumble', 'hesitat', 'surge', 'buck', 'jerk'],
  ['leak', 'drip', 'seep', 'puddle'],
  ['overheat', 'running hot', 'temperature', 'coolant'],
  ['oil consumption', 'burning oil', 'uses oil', 'low oil', 'oil loss'],
  ['shift', 'slip', 'harsh', 'flare', 'transmission', 'trans', 'gear', 'downshift'],
  ['shudder', 'vibrat', 'shake', 'shimmy', 'wobble'],
  ['brake', 'pedal', 'pulsat', 'abs'],
  ['steer', 'pull', 'wander', 'alignment'],
  ['battery', 'drain', 'dead', 'charging', 'alternator', 'voltage'],
  ['check engine', 'mil', 'malfunction indicator', 'engine light', 'service engine'],
  ['smoke', 'smell', 'odor', 'fumes'],
  ['air condition', 'a/c', 'ac ', 'hvac', 'blower', 'heater', 'blend door', 'climate'],
  ['cold start', 'cold soak', 'startup', 'start-up', 'first start', 'morning'],
  ['power', 'acceleration', 'sluggish', 'limp', 'reduced engine power'],
  ['4wd', '4x4', 'four wheel', 'transfer case', 'iwe', 'hub'],
  ['window', 'door', 'lock', 'latch'],
  ['fuel', 'gas', 'mileage', 'mpg'],
  ['turbo', 'boost', 'intercooler', 'wastegate'],
  ['timing chain', 'cam phaser', 'phaser', 'vct', 'cam timing'],
];
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'on', 'in', 'at', 'of', 'to', 'it', 'my', 'is', 'its', "it's", 'when', 'with', 'from', 'for', 'car', 'truck', 'vehicle', 'van', 'suv', 'after', 'while', 'then', 'has', 'have', 'makes', 'making', 'just', 'like', 'sometimes', 'very', 'really', 'there', 'this', 'that', 'what', 'does', 'doing', 'getting', 'get', 'gets', 'keeps', 'few', 'second', 'seconds', 'minute', 'minutes', 'time', 'times', 'every', 'always', 'still', 'again', 'bad', 'light', 'only', 'mph', 'rpm', 'mile', 'miles', 'but', 'not', 'any', 'all', 'some', 'was', 'are', 'been', 'will', 'can', 'goes', 'went']);

// Crude stemmer: rattle/rattles/rattling -> "rattl", stalled -> "stall". Short words stay whole.
export const stem = (w) => (w.length <= 4 ? w : w.replace(/(ing|ed|es|e|s)$/, ''));
const CODE_RE = /\b[PBCU][0-9A-F]{4}\b/gi;
const words = (t) => String(t).toLowerCase().split(/[^a-z0-9\/'-]+/).filter(Boolean);

// Does a phrase occur in the text? Multi-word phrases must appear as written;
// single words match any word in the text that starts with the same stem.
function present(phrase, text, stems) {
  if (phrase.includes(' ') || phrase.includes('/')) return ` ${text} `.includes(` ${phrase}`);
  const p = stem(phrase);
  return p.length <= 3 ? stems.has(p) : [...stems].some((s) => s.startsWith(p));
}

// Turns a description into concepts: each is a list of alternative phrases.
export function concepts(text) {
  const t = String(text).toLowerCase().replace(CODE_RE, ' ');
  const stems = new Set(words(t).map(stem));
  const used = new Set();
  const out = [];
  for (const g of GROUPS) {
    if (g.some((p) => present(p, t, stems))) {
      out.push(g);
      g.forEach((p) => words(p).forEach((w) => used.add(stem(w))));
    }
  }
  for (const w of words(t)) {
    const s = stem(w);
    if (s.length >= 3 && !STOP.has(w) && ![...used].some((u) => u.startsWith(s) || s.startsWith(u))) { out.push([w]); used.add(s); }
  }
  return out;
}
export const codesIn = (text) => [...new Set((String(text).match(CODE_RE) || []).map((c) => c.toUpperCase()))];

// Same matching rule, against a document's text.
export const has = (hay, phrase) => {
  if (phrase.includes(' ') || phrase.includes('/')) return hay.includes(phrase);
  const p = stem(phrase);
  return new RegExp(`\\b${p.replace(/[^a-z0-9]/g, '')}${p.length <= 3 ? '\\b' : ''}`).test(hay);
};

// Score = concepts matched (codes count double), plus a little for matching more than one phrase.
export function score(text, cons, codes) {
  const hay = String(text).toLowerCase();
  let hit = 0;
  for (const c of cons) if (c.some((p) => has(hay, p))) hit++;
  for (const code of codes) if (hay.includes(code.toLowerCase())) hit += 2;
  return hit;
}

const top = (items, textOf, cons, codes, n) => {
  const need = Math.min(cons.length + codes.length, cons.length + codes.length > 2 ? 2 : 1);
  return items
    .map((x) => ({ x, s: score(textOf(x), cons, codes) }))
    .filter((r) => r.s >= need)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((r) => ({ ...r.x, score: r.s }));
};

const ALIASES = {
  CHEVY: 'CHEVROLET', VW: 'VOLKSWAGEN', MERCEDES: 'MERCEDES-BENZ', BENZ: 'MERCEDES-BENZ', OLDS: 'OLDSMOBILE',
  CADDY: 'CADILLAC', LANDROVER: 'LAND ROVER', AMC: 'AMERICAN MOTORS', INTERNATIONALHARVESTER: 'INTERNATIONAL',
};
const COMMON = ['FORD', 'CHEVROLET', 'GMC', 'RAM', 'DODGE', 'TOYOTA', 'HONDA', 'NISSAN', 'JEEP', 'HYUNDAI', 'KIA', 'SUBARU',
  'VOLKSWAGEN', 'CHRYSLER', 'BUICK', 'CADILLAC', 'PONTIAC', 'MAZDA', 'LINCOLN', 'MERCURY', 'PLYMOUTH', 'OLDSMOBILE'];
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

// "2013 ford f-150 rattles on cold start" -> year, make, model and the symptom text.
// `listMakes(year)` / `listModels(year, make)` supply the catalog.
export async function parse(text, listMakes, listModels) {
  const raw = String(text);
  const ym = raw.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (!ym) return { error: 'Start with the year, like "2013 Ford F-150 rattles on cold start".' };
  const year = ym[1];
  const tokens = raw.replace(ym[0], ' ').split(/\s+/).filter(Boolean);
  const ntoks = tokens.map(norm);

  const makes = await listMakes(year);
  let make = null;
  let makeIdx = [];
  for (let i = 0; i < ntoks.length && !make; i++) {
    for (const len of [3, 2, 1]) {
      const joined = ntoks.slice(i, i + len).join('');
      const hit = makes.find((m) => norm(m) === joined) || (ALIASES[joined] && makes.includes(ALIASES[joined]) && ALIASES[joined]);
      if (hit) { make = hit; makeIdx = [...Array(len).keys()].map((k) => i + k); break; }
    }
  }
  // No make named ("2012 Silverado 1500"): find which common make sells a model by that name.
  if (!make) {
    const lists = await Promise.all(COMMON.filter((m) => makes.includes(m)).map(async (m) => [m, await listModels(year, m).catch(() => [])]));
    for (const [m, list] of lists) {
      const i = ntoks.findIndex((t) => t.length >= 2 && list.some((x) => norm(x.split(/\s+/)[0]) === t));
      if (i >= 0) { make = m; makeIdx = [i - 1]; break; }
    }
  }
  if (!make) return { year, error: 'Which make? Put it after the year, like "2013 Ford F-150 …".' };

  // Best model: the one whose name matches the most consecutive words right after the make.
  const models = await listModels(year, make);
  const after = makeIdx.at(-1) + 1;
  let best = null;
  for (const m of models) {
    const parts = m.split(/\s+/).map(norm);
    let n = 0;
    while (n < parts.length && ntoks[after + n] === parts[n]) n++;
    if (n && (!best || n > best.n || (n === best.n && m.length < best.m.length))) best = { m, n };
  }
  // Fallback: model named anywhere in the text by its first word.
  if (!best) {
    for (const m of models) {
      const i = ntoks.indexOf(norm(m.split(/\s+/)[0]));
      if (i >= 0 && !makeIdx.includes(i) && (!best || m.length < best.m.length)) best = { m, n: 1, at: i };
    }
  }
  if (!best) return { year, make, error: `Couldn't find the model. Which ${make}?`, models };
  const start = best.at ?? after;
  const drop = new Set([...makeIdx.filter((i) => i >= 0), ...[...Array(best.n).keys()].map((k) => start + k)]);
  return { year, make, model: best.m, q: tokens.filter((_, i) => !drop.has(i)).join(' ').trim() };
}

// NHTSA splits one model into several listings (cab styles, trims); bulletins and
// complaints are filed against each, so search the sibling listings too.
async function siblings(year, make, model) {
  const base = String(model).toUpperCase().split(/\s+/)[0];
  const all = await nhtsa.models(year, make).catch(() => []);
  const sib = all.filter((m) => m.split(/\s+/)[0] === base);
  return sib.length ? sib.slice(0, 6) : [model];
}

export async function diagnose({ year, make, model, q }) {
  const cons = concepts(q);
  const codes = codesIn(q);
  const models = await siblings(year, make, model);

  const settle = (p) => p.then((v) => v, () => null);
  const per = await Promise.all(models.map((m) => Promise.all([
    settle(nhtsa.bulletins(year, make, m)), settle(nhtsa.recalls(year, make, m)), settle(nhtsa.complaintsRaw(year, make, m)),
  ])));
  const dedupe = (list, key) => [...new Map(list.map((x) => [x[key], x])).values()];
  // Revisions of one bulletin (01-06-01-011M, N, O...) collapse to the newest.
  const tsbs = dedupe(
    dedupe(per.flatMap(([b]) => b?.tsbs || []), 'id')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((t) => ({ ...t, base: String(t.number || t.id).replace(/(\d)[A-Z]$/, '$1') })),
    'base',
  );
  const investigations = dedupe(per.flatMap(([b]) => b?.investigations || []), 'id');
  // Recalls are often filed under the plain model name ("F-150") rather than the cab variants.
  const base = String(model).toUpperCase().split(/\s+/)[0];
  const baseRecalls = models.includes(base) ? [] : await settle(nhtsa.recalls(year, make, base));
  const recalls = dedupe([...per.flatMap(([, r]) => r || []), ...(baseRecalls || [])], 'campaign');
  const complaints = dedupe(per.flatMap(([, , c]) => c || []), 'id');
  const knowledge = await kb.forVehicle({ year, make, model });

  const kbText = (e) => [e.title, e.summary, e.body, ...(e.tags || []), ...(e.specs || []).map((s) => `${s.name} ${s.value}`),
    ...(e.steps || []).map((s) => (typeof s === 'string' ? s : s.text))].join(' ');
  const matchedComplaints = top(complaints, (c) => `${c.components} ${c.summary}`, cons, codes, 1e9);

  return {
    vehicle: { year, make, model, searched: models },
    understood: { concepts: cons.map((c) => c[0]), codes },
    codes: codes.map((c) => dtcLookup(c)),
    knowledge: top(knowledge, kbText, cons, codes, 10),
    tsbs: top(tsbs, (t) => `${t.number} ${t.components.join(' ')} ${t.summary}`, cons, codes, 25),
    recalls: top(recalls, (r) => `${r.component} ${r.summary} ${r.consequence}`, cons, codes, 10),
    investigations: top(investigations, (i) => `${i.subject} ${i.summary}`, cons, codes, 5),
    owners: {
      matched: matchedComplaints.length,
      total: complaints.length,
      examples: matchedComplaints.slice(0, 12).map(({ id, filed, summary, components }) => ({ id, filed, summary, components })),
    },
    counts: { tsbs: tsbs.length, recalls: recalls.length, complaints: complaints.length, knowledge: knowledge.length },
  };
}
