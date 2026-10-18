// OBD-II trouble code lookup: exact generic codes, numbered families, and a
// plain-English breakdown of what any code's characters mean.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './paths.js';

const db = JSON.parse(fs.readFileSync(path.join(DATA, 'dtc', 'generic-powertrain.json'), 'utf8'));

const SYSTEMS = { P: 'Powertrain (engine/transmission)', B: 'Body', C: 'Chassis (brakes, steering, suspension)', U: 'Network/communication' };
const P_SUBSYSTEM = {
  0: 'Fuel/air metering and auxiliary emissions', 1: 'Fuel/air metering', 2: 'Fuel/air metering (injector circuits)',
  3: 'Ignition system or misfire', 4: 'Auxiliary emission controls', 5: 'Vehicle speed, idle control, auxiliary inputs',
  6: 'Computer and output circuits', 7: 'Transmission', 8: 'Transmission', 9: 'Transmission',
  A: 'Hybrid propulsion', B: 'Hybrid propulsion', C: 'Hybrid propulsion',
};

function explain(code) {
  const [sys, kind, sub] = code;
  let origin;
  if (kind === '0' || kind === '2') origin = 'Generic (SAE): same meaning on every make';
  else if (kind === '1') origin = 'Manufacturer-specific: meaning depends on the make';
  else origin = sys === 'P' && code[2] >= '4' ? 'Generic (SAE)' : 'Manufacturer-specific or reserved: meaning depends on the make';
  const parts = [{ label: 'System', value: SYSTEMS[sys] }, { label: 'Type', value: origin }];
  if (sys === 'P' && P_SUBSYSTEM[sub]) parts.push({ label: 'Area', value: P_SUBSYSTEM[sub] });
  return { parts, generic: origin.startsWith('Generic') };
}

export function lookup(input) {
  const code = String(input).trim().toUpperCase();
  if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(code)) return { code, valid: false };
  const base = { code, valid: true, ...explain(code), sources: db.sources, causesStatus: db.causesStatus };
  if (db.codes[code]) return { ...base, ...db.codes[code], known: true };
  if (code.startsWith('P0')) {
    const num = Number(code.slice(2));
    for (const f of db.families) {
      if (num >= f.from && num <= f.to) {
        const n = num - f.from + 1;
        const title = f.title.replace('{n}', n).replace('{L}', String.fromCharCode(64 + n));
        return { ...base, title, causes: f.causes, checks: f.checks, known: true };
      }
    }
  }
  return { ...base, known: false };
}
