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

async function complaintRows(year, make, model) {
  const body = await cachedJson(
    `${API}/complaints/complaintsByVehicle?make=${q(make)}&model=${q(model)}&modelYear=${q(year)}`,
    { ttlHours: 72 },
  );
  return body.results || [];
}

export async function complaintsRaw(year, make, model) {
  return (await complaintRows(year, make, model)).map((r) => ({
    id: r.odiNumber, filed: r.dateComplaintFiled, summary: r.summary || '', components: r.components || '',
  }));
}

// Owner complaints grouped by component, so repeat failures float to the top.
export async function complaints(year, make, model) {
  const rows = await complaintRows(year, make, model);
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

// Manufacturer communications (TSBs, special service messages) and NHTSA defect
// investigations. One model name can map to several NHTSA vehicle records
// (trim/drive), so merge them and drop duplicates.
export async function bulletins(year, make, model) {
  const body = await cachedJson(
    `${API}/vehicles/byYmmt?data=manufacturercommunications,investigations&modelYear=${q(year)}&make=${q(make)}&model=${q(model)}&productDetail=minimal&max=100`,
    { ttlHours: 72 },
  );
  const tsbs = new Map();
  const investigations = new Map();
  for (const r of body.results || []) {
    for (const m of r.safetyIssues?.manufacturerCommunications || []) {
      tsbs.set(m.nhtsaIdNumber, {
        id: m.nhtsaIdNumber,
        number: m.manufacturerCommunicationNumber,
        date: m.communicationDate?.slice(0, 10),
        summary: m.summary,
        components: (m.components || []).map((c) => c.name),
        docs: m.associatedDocumentsCount || 0,
      });
    }
    for (const i of r.safetyIssues?.investigations || []) {
      investigations.set(i.nhtsaActionNumber, {
        id: i.nhtsaActionNumber,
        subject: i.subject,
        summary: i.summary,
        opened: i.dateOpened?.slice(0, 10),
        closed: i.dateClosed?.slice(0, 10),
        components: (i.components || []).map((c) => c.name),
        recalls: (i.recalls || []).map((x) => x.nhtsaCampaignNumber),
      });
    }
  }
  const byDate = (a, b) => String(b.date || b.opened).localeCompare(String(a.date || a.opened));
  return { tsbs: [...tsbs.values()].sort(byDate), investigations: [...investigations.values()].sort(byDate) };
}

// The bulletin PDFs themselves, hosted by NHTSA.
export async function bulletinDocs(kind, id) {
  const filter = kind === 'investigation' ? 'investigations' : 'manufacturerCommunications';
  const body = await cachedJson(`${API}/safetyIssues/byNhtsaId?nhtsaId=${q(id)}&filter=issueType&filterValue=${filter}`, { ttlHours: 720 });
  const item = body.results?.[0]?.[filter]?.[0];
  return (item?.associatedDocuments || []).map((d) => ({ url: d.url, name: d.fileName, label: d.summary, date: d.loadDate?.slice(0, 10) }));
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
