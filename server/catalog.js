// Classic-model catalog that fills the gaps in NHTSA's list for older years.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './paths.js';

const classic = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog', 'classic-models.json'), 'utf8')).makes;

export function classicMakes(year) {
  const y = Number(year);
  return Object.keys(classic).filter((mk) => classic[mk].some(([, a, b]) => y >= a && y <= b));
}

export function classicModels(year, make) {
  const y = Number(year);
  return (classic[String(make).toUpperCase()] || []).filter(([, a, b]) => y >= a && y <= b).map(([m]) => m);
}
