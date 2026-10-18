// Builds data/dtc/codes.json: every trouble-code definition from openly licensed
// public datasets, merged, with each definition footnoted to the datasets that list it.
//
//   git clone https://github.com/Wal33D/dtc-database      <dir>/dtc-database
//   git clone https://github.com/mytrile/obd-trouble-codes <dir>/obd-trouble-codes
//   git clone https://github.com/todrobbins/dtcdb          <dir>/dtcdb
//   git clone https://github.com/fabiovila/OBDIICodes      <dir>/OBDIICodes
//   node scripts/build-dtc.js <dir>
//
// Generic vs manufacturer-specific is decided by the code's own structure (SAE J2012),
// not by which file a dataset put it in.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DATA } from '../server/paths.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/build-dtc.js <folder with the cloned datasets>');

const SOURCES = [
  { key: 'wal33d', folder: 'dtc-database', title: 'dtc-database (Wal33D)', url: 'https://github.com/Wal33D/dtc-database', license: 'MIT' },
  { key: 'mytrile', folder: 'obd-trouble-codes', title: 'obd-trouble-codes (Dimitar Kostov)', url: 'https://github.com/mytrile/obd-trouble-codes', license: 'MIT' },
  { key: 'dtcdb', folder: 'dtcdb', title: 'dtcdb (todrobbins)', url: 'https://github.com/todrobbins/dtcdb', license: 'MIT' },
  { key: 'fabiovila', folder: 'OBDIICodes', title: 'OBDIICodes (Fabio Vila)', url: 'https://github.com/fabiovila/OBDIICodes', license: 'MIT' },
];

const MAKES = {
  acura: 'ACURA', audi: 'AUDI', bmw: 'BMW', buick: 'BUICK', cadillac: 'CADILLAC', chevy: 'CHEVROLET',
  chrysler: 'CHRYSLER', dodge: 'DODGE', ford: 'FORD', geo: 'GEO', gm: 'GM (all GM brands)', gmc: 'GMC',
  honda: 'HONDA', infiniti: 'INFINITI', jaguar: 'JAGUAR', jeep: 'JEEP', kia: 'KIA', lexus: 'LEXUS',
  lincoln: 'LINCOLN', mazda: 'MAZDA', mercedes: 'MERCEDES-BENZ', mercury: 'MERCURY', mitsubishi: 'MITSUBISHI',
  nissan: 'NISSAN', oldsmobile: 'OLDSMOBILE', plymouth: 'PLYMOUTH', pontiac: 'PONTIAC', saturn: 'SATURN',
  subaru: 'SUBARU', suzuki: 'SUZUKI', toyota: 'TOYOTA', volkswagen: 'VOLKSWAGEN', other: null,
};
export const UNSPECIFIED = 'Make not stated';
const CODE = /^[PBCU][0-9A-F]{4}$/;

export function isGeneric(code) {
  const [sys, d1, d2] = code;
  if (sys === 'P') return d1 === '0' || d1 === '2' || (d1 === '3' && d2 >= '4');
  return d1 === '0' || d1 === '3';
}

const clean = (s) => String(s).replace(/\s+/g, ' ').replace(/\s+([,./])/g, '$1').trim();
const key = (s) => s.toLowerCase().replace(/\b(malfunction|problem)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Each reader yields [code, description, make|null].
function* readWal33d(root) {
  const src = path.join(root, 'data', 'source-data');
  // audi_codes.txt holds lists of likely causes for generic codes, not definitions; skipped.
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.txt') && x !== 'audi_codes.txt')) {
    const stem = f.replace('_codes.txt', '');
    const make = ['p', 'b', 'c', 'u'].includes(stem) ? null : MAKES[stem];
    for (const line of fs.readFileSync(path.join(src, f), 'utf8').split(/\r?\n/)) {
      const i = line.indexOf(' - ');
      if (i > 0) yield [line.slice(0, i), line.slice(i + 3), make];
    }
  }
}
function* readMytrile(root) {
  for (const line of fs.readFileSync(path.join(root, 'obd-trouble-codes.csv'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(.*)"$/);
    if (m) yield [m[1], m[2], null];
  }
}
function* readDtcdb(root) {
  for (const line of fs.readFileSync(path.join(root, 'generic.csv'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([PBCU][0-9A-F]{4}),(.*)$/i);
    if (m) yield [m[1], m[2].replace(/^"|"$/g, ''), null];
  }
}
function* readFabiovila(root) {
  for (const r of JSON.parse(fs.readFileSync(path.join(root, 'codes.json'), 'utf8'))) {
    yield [String(r.Code).split('/')[0], r.Description, null];
  }
}
const READERS = { wal33d: readWal33d, mytrile: readMytrile, dtcdb: readDtcdb, fabiovila: readFabiovila };

// codes[code][scope][titleKey] = { t, n: {title: count}, s: Set(sourceIdx) }
const codes = {};
const sources = [];
SOURCES.forEach((s, idx) => {
  const root = path.join(dir, s.folder);
  let commit = '', date = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
    date = execSync('git log -1 --format=%cs', { cwd: root }).toString().trim();
  } catch {}
  let count = 0;
  for (const [rawCode, rawDesc, make] of READERS[s.key](root)) {
    const code = String(rawCode).trim().toUpperCase();
    const t = clean(rawDesc);
    if (!CODE.test(code) || !t || /^reserved/i.test(t) || /^iso\/sae reserved/i.test(t)) continue;
    const scope = isGeneric(code) ? (make ? make : 'generic') : make || UNSPECIFIED;
    const k = key(t);
    const slot = (((codes[code] ??= {})[scope] ??= {})[k] ??= { n: {}, s: new Set() });
    slot.n[t] = (slot.n[t] || 0) + 1;
    slot.s.add(idx + 1);
    count++;
  }
  sources.push({ title: s.title, url: s.url, license: s.license, version: commit && `${commit} (${date})`, definitions: count });
});

// Wording variants of one definition ("Regulator A Control" vs "Regulator Control",
// OCR-joined words) are merged when their letter trigrams mostly overlap.
const grams = (s) => {
  const x = key(s).replace(/ /g, '');
  const g = new Set();
  for (let i = 0; i < x.length - 2; i++) g.add(x.slice(i, i + 3));
  return g;
};
export const similar = (a, b) => {
  const A = grams(a), B = grams(b);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size || 1) >= 0.8;
};

function cluster(variants) {
  const groups = [];
  for (const v of Object.values(variants)) {
    const title = Object.entries(v.n).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const g = groups.find((x) => similar(x.title, title));
    if (g) { v.s.forEach((s) => g.s.add(s)); if (v.s.size > g.best) { g.title = title; g.best = v.s.size; } }
    else groups.push({ title, s: new Set(v.s), best: v.s.size });
  }
  return groups.map((g) => [g.title, [...g.s].sort()]).sort((a, b) => b[1].length - a[1].length);
}

// Flatten: { "P0420": { "generic": [["Catalyst ...", [1,2,3]]], "FORD": [...] } }
const out = {};
let defs = 0;
for (const code of Object.keys(codes).sort()) {
  out[code] = {};
  for (const [scope, variants] of Object.entries(codes[code])) {
    out[code][scope] = cluster(variants);
    defs += out[code][scope].length;
  }
}

const file = path.join(DATA, 'dtc', 'codes.json');
fs.writeFileSync(file, JSON.stringify({
  note: 'Trouble-code definitions merged from openly licensed public datasets. Each definition lists the datasets that contain it. None of these datasets documents its own upstream source, so a definition found in only one dataset is weaker evidence than one found in several. Generic vs manufacturer-specific is classified by code structure per SAE J2012.',
  built: new Date().toISOString().slice(0, 10),
  sources,
  codes: out,
}) + '\n');
console.log(`${Object.keys(out).length} codes, ${defs} definitions -> ${path.relative(process.cwd(), file)}`);
