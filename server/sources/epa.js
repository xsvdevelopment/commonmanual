// EPA fueleconomy.gov: engine/transmission/drivetrain configs for 1984+.
// EPA names models differently from NHTSA ("F150 Pickup 2WD" vs "F-150 SUPER CREW"),
// so candidates are matched on the base model token.
import { cachedJson } from '../cache.js';

const EPA = 'https://www.fueleconomy.gov/ws/rest';
const JSON_HDR = { headers: { Accept: 'application/json' }, ttlHours: 2160 };
const q = encodeURIComponent;

const items = (body) => {
  const m = body?.menuItem;
  return m ? (Array.isArray(m) ? m : [m]) : [];
};
export const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function matchModels(nhtsaModel, epaModels) {
  const base = norm(String(nhtsaModel).split(/\s+/)[0]);
  if (!base) return [];
  return epaModels.filter((m) => norm(m).startsWith(base) || norm(m).includes(base));
}

export async function candidates(year, make, model) {
  if (Number(year) < 1984) return [];
  const epaMake = items(await cachedJson(`${EPA}/vehicle/menu/make?year=${q(year)}`, JSON_HDR))
    .map((i) => i.value)
    .find((m) => norm(m) === norm(make));
  if (!epaMake) return [];
  const epaModels = items(await cachedJson(`${EPA}/vehicle/menu/model?year=${q(year)}&make=${q(epaMake)}`, JSON_HDR))
    .map((i) => i.value);
  const matched = matchModels(model, epaModels).slice(0, 8);
  const out = [];
  for (const m of matched) {
    const opts = items(
      await cachedJson(`${EPA}/vehicle/menu/options?year=${q(year)}&make=${q(epaMake)}&model=${q(m)}`, JSON_HDR),
    );
    for (const o of opts) out.push({ epaModel: m, config: o.text, id: o.value });
  }
  return out;
}

export async function details(id) {
  const v = await cachedJson(`${EPA}/vehicle/${q(id)}`, JSON_HDR);
  const pick = [
    ['Displacement (L)', v.displ], ['Cylinders', v.cylinders], ['Transmission', v.trany],
    ['Drive', v.drive], ['Engine notes', v.eng_dscr], ['Turbo', v.tCharger ? 'Yes' : ''],
    ['Supercharger', v.sCharger === 'S' ? 'Yes' : ''], ['Start/stop', v.startStop === 'Y' ? 'Yes' : ''],
    ['Fuel', v.fuelType1], ['Class', v.VClass], ['Hybrid/EV', v.atvType], ['EV motor', v.evMotor],
    ['MPG city / hwy', v.city08 && `${v.city08} / ${v.highway08}`],
  ];
  return {
    id, year: v.year, make: v.make, model: v.model,
    fields: pick.filter(([, val]) => val && val !== '-1').map(([label, value]) => ({ label, value: String(value) })),
  };
}
