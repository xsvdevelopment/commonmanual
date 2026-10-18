// NHTSA public APIs: product catalog (1949+), recalls, owner complaints, vPIC VIN decoding.
import { cachedJson } from '../cache.js';

const API = 'https://api.nhtsa.gov';
const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const q = encodeURIComponent;

// The catalog is split by issue type (r = recalls, c = complaints); a vehicle can
// appear in only one, so merge both.
async function catalog(pathAndQuery) {
  const lists = await Promise.allSettled(
    ['r', 'c'].map((t) => cachedJson(`${API}/products/vehicle/${pathAndQuery}&issueType=${t}`, { ttlHours: 720 })),
  );
  const ok = lists.filter((l) => l.status === 'fulfilled');
  if (!ok.length) throw lists[0].reason;
  return ok.flatMap((l) => l.value.results || []);
}

export async function makes(year) {
  const rows = await catalog(`makes?modelYear=${q(year)}`);
  return [...new Set(rows.map((r) => r.make))].sort();
}

export async function models(year, make) {
  const rows = await catalog(`models?modelYear=${q(year)}&make=${q(make)}`);
  return [...new Set(rows.map((r) => r.model))].sort();
}

export async function recalls(year, make, model) {
  const body = await cachedJson(
    `${API}/recalls/recallsByVehicle?make=${q(make)}&model=${q(model)}&modelYear=${q(year)}`,
    { ttlHours: 72 },
  );
  return (body.results || []).map((r) => ({
    campaign: r.NHTSACampaignNumber,
    date: r.ReportReceivedDate,
    component: r.Component,
    summary: r.Summary,
    consequence: r.Consequence,
    remedy: r.Remedy,
    notes: r.Notes,
    parkIt: !!r.parkIt,
  }));
}

// Owner complaints grouped by component, so repeat failures float to the top.
export async function complaints(year, make, model) {
  const body = await cachedJson(
    `${API}/complaints/complaintsByVehicle?make=${q(make)}&model=${q(model)}&modelYear=${q(year)}`,
    { ttlHours: 72 },
  );
  const rows = body.results || [];
  const groups = new Map();
  for (const r of rows) {
    for (const comp of String(r.components || 'UNKNOWN').split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!groups.has(comp)) groups.set(comp, []);
      groups.get(comp).push(r);
    }
  }
  const byComponent = [...groups.entries()]
    .map(([component, list]) => ({
      component,
      count: list.length,
      crashes: list.filter((r) => r.crash).length,
      fires: list.filter((r) => r.fire).length,
      reports: list
        .slice()
        .sort((a, b) => new Date(b.dateComplaintFiled) - new Date(a.dateComplaintFiled))
        .slice(0, 40)
        .map((r) => ({ id: r.odiNumber, filed: r.dateComplaintFiled, summary: r.summary })),
    }))
    .sort((a, b) => b.count - a.count);
  return { total: rows.length, byComponent };
}

const VIN_FIELDS = {
  ModelYear: 'Year', Make: 'Make', Model: 'Model', Series: 'Series', Trim: 'Trim',
  BodyClass: 'Body', Doors: 'Doors', DriveType: 'Drive', EngineModel: 'Engine code',
  DisplacementL: 'Displacement (L)', EngineCylinders: 'Cylinders', EngineConfiguration: 'Engine layout',
  EngineHP: 'Horsepower', ValveTrainDesign: 'Valvetrain', FuelTypePrimary: 'Fuel', FuelInjectionType: 'Fuel system',
  Turbo: 'Turbo', TransmissionStyle: 'Transmission', TransmissionSpeeds: 'Trans speeds',
  BrakeSystemType: 'Brakes', GVWR: 'GVWR', Manufacturer: 'Manufacturer', PlantCity: 'Plant city',
  PlantCountry: 'Plant country',
};

export async function decodeVin(vin) {
  const body = await cachedJson(`${VPIC}/DecodeVinValues/${q(vin)}?format=json`, { ttlHours: 8760 });
  const raw = body.Results?.[0] || {};
  const fields = Object.entries(VIN_FIELDS)
    .filter(([k]) => raw[k] && raw[k] !== 'Not Applicable')
    .map(([k, label]) => ({ key: k, label, value: raw[k] }));
  return {
    vin,
    year: raw.ModelYear || null,
    make: raw.Make || null,
    model: raw.Model || null,
    fields,
    warning: raw.ErrorCode && raw.ErrorCode !== '0' ? raw.ErrorText : null,
  };
}
