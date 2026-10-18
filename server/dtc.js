// OBD-II trouble code lookup. Definitions come from data/dtc/codes.json (merged
// public datasets, footnoted per definition, built by scripts/build-dtc.js).
// The causes/checks in generic-powertrain.json are unsourced drafts.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './paths.js';

const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, 'dtc', f), 'utf8'));
const defs = load('codes.json');
const drafts = load('generic-powertrain.json');

const SYSTEMS = { P: 'Powertrain (engine/transmission)', B: 'Body', C: 'Chassis (brakes, steering, suspension)', U: 'Network/communication' };
const P_SUBSYSTEM = {
  0: 'Fuel/air metering and auxiliary emissions', 1: 'Fuel/air metering', 2: 'Fuel/air metering (injector circuits)',
  3: 'Ignition system or misfire', 4: 'Auxiliary emission controls', 5: 'Vehicle speed, idle control, auxiliary inputs',
  6: 'Computer and output circuits', 7: 'Transmission', 8: 'Transmission', 9: 'Transmission',
  A: 'Hybrid propulsion', B: 'Hybrid propulsion', C: 'Hybrid propulsion',
};
export const STRUCTURE_SOURCE = { title: 'SAE J2012: Diagnostic Trouble Code Definitions (code structure)', publisher: 'SAE International', url: 'https://www.sae.org/standards/content/j2012_201612/' };

export function isGeneric(code) {
  const [sys, d1, d2] = code;
  if (sys === 'P') return d1 === '0' || d1 === '2' || (d1 === '3' && d2 >= '4');
  return d1 === '0' || d1 === '3';
}

function explain(code) {
  const generic = isGeneric(code);
  const parts = [
    { label: 'System', value: SYSTEMS[code[0]] },
    { label: 'Type', value: generic ? 'Generic (SAE): same meaning on every make' : 'Manufacturer-specific: meaning depends on the make' },
  ];
  if (code[0] === 'P' && P_SUBSYSTEM[code[2]]) parts.push({ label: 'Area', value: P_SUBSYSTEM[code[2]] });
  return { parts, generic };
}

function draftFamily(code) {
  if (!code.startsWith('P0')) return null;
  const num = Number(code.slice(2));
  return drafts.families.find((f) => num >= f.from && num <= f.to) || null;
}

// Datasets that word most shared codes identically almost certainly copy one upstream,
// so they count once toward agreement. Measured on shared codes, normalized text:
// dtcdb / OBDIICodes 75% identical; every other pair 2-36% (see issue #12).
const SAME_UPSTREAM = [['https://github.com/todrobbins/dtcdb', 'https://github.com/fabiovila/OBDIICodes']];
const lineageOf = (k) => {
  const url = defs.sources[k - 1]?.url;
  const group = SAME_UPSTREAM.findIndex((g) => g.includes(url));
  return group >= 0 ? `group${group}` : `src${k}`;
};
export const lineages = (src) => new Set(src.map(lineageOf)).size;

const shape = (list) => list.map(([title, src]) => ({ title, src, lineages: lineages(src) }));

export function lookup(input) {
  const code = String(input).trim().toUpperCase();
  if (!/^[PBCU][0-9A-F]{4}$/.test(code)) return { code, valid: false };
  const entry = defs.codes[code] || {};
  const { generic: g, ...byMake } = entry;
  const draft = drafts.codes[code] || draftFamily(code);
  return {
    code, valid: true, ...explain(code),
    definitions: g ? shape(g) : [],
    makes: Object.entries(byMake).map(([make, list]) => ({ make, definitions: shape(list) })).sort((a, b) => a.make.localeCompare(b.make)),
    sources: defs.sources, sameUpstream: SAME_UPSTREAM, structureSource: STRUCTURE_SOURCE,
    draft: draft ? { causes: draft.causes, checks: draft.checks } : null,
  };
}

// Text search over every definition; returns one row per code.
export function search(q, limit = 200) {
  const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const [code, scopes] of Object.entries(defs.codes)) {
    for (const [scope, list] of Object.entries(scopes)) {
      const hit = list.find(([t]) => terms.every((x) => `${code} ${t}`.toLowerCase().includes(x)));
      if (hit) { out.push({ code, scope, title: hit[0], n: lineages(hit[1]) }); break; }
    }
    if (out.length >= limit) break;
  }
  return out;
}

export const stats = () => {
  let generic = 0, mfr = 0;
  for (const s of Object.values(defs.codes)) { if (s.generic) generic++; mfr += Object.keys(s).filter((k) => k !== 'generic').length; }
  return { codes: Object.keys(defs.codes).length, generic, makeDefinitions: mfr, built: defs.built };
};
