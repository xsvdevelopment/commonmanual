import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA } from './paths.js';
import * as nhtsa from './sources/nhtsa.js';
import * as epa from './sources/epa.js';
import * as kb from './kb.js';
import { lookup as dtcLookup } from './dtc.js';
import { classicMakes, classicModels } from './catalog.js';

const PORT = Number(process.env.PORT) || 4747;
const DEV = process.argv.includes('--dev');
const oem = JSON.parse(fs.readFileSync(path.join(DATA, 'oem-sites.json'), 'utf8'));

const app = express();
app.use(express.json({ limit: '1mb' }));

// Wrap async handlers so upstream failures come back as JSON errors.
const h = (fn) => (req, res) =>
  fn(req, res).catch((err) => res.status(err.status || 502).json({ error: err.message || 'Upstream error' }));

const need = (req, ...keys) => {
  for (const k of keys) if (!req.query[k]) throw Object.assign(new Error(`missing ${k}`), { status: 400 });
  return keys.map((k) => String(req.query[k]));
};

// NHTSA's catalog merged with the classic catalog; either one alone still answers.
const merged = async (live, local) => {
  const rows = await live.catch(() => []);
  return [...new Set([...rows, ...local])].sort();
};
app.get('/api/makes', h(async (req, res) => {
  const [year] = need(req, 'year');
  res.json(await merged(nhtsa.makes(year), classicMakes(year)));
}));
app.get('/api/models', h(async (req, res) => {
  const [year, make] = need(req, 'year', 'make');
  res.json(await merged(nhtsa.models(year, make), classicModels(year, make)));
}));
app.get('/api/vin/:vin', h(async (req, res) => {
  const vin = req.params.vin.trim().toUpperCase();
  if (vin.length !== 17) {
    return res.json({ vin, preStandard: true, fields: [], warning:
      'Pre-1981 VINs are not standardized (usually 11-13 characters) and can only be decoded per make. Pick the year, make and model by hand.' });
  }
  res.json(await nhtsa.decodeVin(vin));
}));
app.get('/api/vehicle/recalls', h(async (req, res) => res.json(await nhtsa.recalls(...need(req, 'year', 'make', 'model')))));
app.get('/api/vehicle/complaints', h(async (req, res) => res.json(await nhtsa.complaints(...need(req, 'year', 'make', 'model')))));
app.get('/api/vehicle/epa', h(async (req, res) => res.json(await epa.candidates(...need(req, 'year', 'make', 'model')))));
app.get('/api/epa/:id', h(async (req, res) => res.json(await epa.details(req.params.id))));

const drafts = (req) => req.query.drafts === '1';
app.get('/api/kb', h(async (req, res) => {
  const [year, make] = need(req, 'year', 'make');
  res.json(await kb.forVehicle({ year, make, model: req.query.model || '' }, { drafts: drafts(req) }));
}));
app.get('/api/kb/search', h(async (req, res) => res.json(await kb.search(req.query.q || '', { drafts: drafts(req) }))));
app.get('/api/kb/stats', h(async (req, res) => {
  const { entries, problems } = await kb.loadAll();
  const count = (f) => Object.fromEntries(kb.STATUSES.map((s) => [s, entries.filter((e) => e.status === s && f(e)).length]));
  res.json({ total: entries.length, byStatus: count(() => true), problems });
}));
// The citation queue: drafts waiting for someone to footnote them.
app.get('/api/kb/drafts', h(async (req, res) => {
  const { entries } = await kb.loadAll();
  res.json(entries.filter((e) => e.status === 'draft').map(({ id, type, title, applies }) => ({ id, type, title, applies })));
}));
app.get('/api/kb/:id', h(async (req, res) => {
  const e = await kb.get(req.params.id);
  e ? res.json(e) : res.status(404).json({ error: 'not found' });
}));
app.post('/api/kb', h(async (req, res) => {
  if (req.query.new && (await kb.get(req.body?.id))) {
    return res.status(409).json({ errs: [`id "${req.body.id}" already exists. Change the title or edit that entry instead.`] });
  }
  const out = await kb.save(req.body);
  out.errs ? res.status(400).json(out) : res.json(out);
}));

app.get('/api/dtc/:code', (req, res) => res.json(dtcLookup(req.params.code)));
app.get('/api/oem', (req, res) => {
  const make = String(req.query.make || '').toUpperCase();
  res.json({ ...oem, sites: make ? oem.sites.filter((s) => s.makes.includes(make)) : oem.sites });
});

app.use('/api', (err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.js'), server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) {
    console.error('No build found. Run "npm run build" first, or "npm run dev".');
    process.exit(1);
  }
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`OpenBay running at http://localhost:${PORT}`));
