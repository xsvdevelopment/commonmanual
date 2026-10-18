// All OpenBay routes. Used by the local server (index.js) and the hosted preview (netlify/functions/api.mjs).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './paths.js';
import * as nhtsa from './sources/nhtsa.js';
import * as epa from './sources/epa.js';
import * as kb from './kb.js';
import * as dtc from './dtc.js';
import { classicMakes, classicModels } from './catalog.js';
import { diagnose, parse } from './diagnose.js';

const oem = JSON.parse(fs.readFileSync(path.join(DATA, 'oem-sites.json'), 'utf8'));

export function createApp({ readOnly = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // The hosted public preview is read-only: contributions go through GitHub.
  app.get('/api/config', (req, res) => res.json({ readOnly, repo: 'https://github.com/xsvdevelopment/openbay' }));
  if (readOnly) {
    const msg = 'This is the read-only public preview. To add knowledge, run OpenBay on your own computer or open a pull request on GitHub.';
    app.post('/api/*', (req, res) => res.status(403).json({ error: msg, errs: [msg] }));
  }

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
  app.get('/api/vehicle/bulletins', h(async (req, res) => res.json(await nhtsa.bulletins(...need(req, 'year', 'make', 'model')))));
  app.get('/api/bulletin-docs/:kind/:id', h(async (req, res) => res.json(await nhtsa.bulletinDocs(req.params.kind, req.params.id))));
  app.get('/api/parse', h(async (req, res) => {
    const listMakes = (y) => merged(nhtsa.makes(y), classicMakes(y));
    const listModels = (y, m) => merged(nhtsa.models(y, m), classicModels(y, m));
    res.json(await parse(String(req.query.text || ''), listMakes, listModels));
  }));
  app.get('/api/diagnose', h(async (req, res) => {
    const [year, make, model, q] = need(req, 'year', 'make', 'model', 'q');
    res.json(await diagnose({ year, make, model, q }));
  }));
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

  app.post('/api/media/:entryId', express.raw({ type: 'image/*', limit: '6mb' }), h(async (req, res) => {
    const out = await kb.savePhoto(req.params.entryId, req.body);
    out.error ? res.status(400).json(out) : res.json(out);
  }));
  app.use('/media', express.static(kb.MEDIA_DIR, { maxAge: '7d' }));

  app.get('/api/dtc',(req, res) => res.json(req.query.q ? dtc.search(req.query.q) : dtc.stats()));
  app.get('/api/dtc/:code', (req, res) => res.json(dtc.lookup(req.params.code)));
  app.get('/api/oem', (req, res) => {
    const make = String(req.query.make || '').toUpperCase();
    res.json({ ...oem, sites: make ? oem.sites.filter((s) => s.makes.includes(make)) : oem.sites });
  });

  app.use('/api', (err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

  return app;
}
