import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, applies } from '../server/kb.js';
import { lookup, isGeneric, search } from '../server/dtc.js';
import { matchModels } from '../server/sources/epa.js';
import { classicModels } from '../server/catalog.js';
import { concepts, codesIn, score, parse } from '../server/diagnose.js';

const cited = {
  id: 'test-entry', type: 'spec', title: 'Test specs', status: 'cited',
  applies: [{ make: 'CHEVROLET', models: ['C10'], years: [1967, 1972] }],
  specs: [{ name: 'Head bolts', value: '65', unit: 'ft-lb', src: [1] }],
  sources: [{ title: 'Factory manual', citation: 'p. 6-24' }],
};

test('a fully footnoted entry validates', () => {
  assert.deepEqual(validateEntry(cited), []);
});

test('a non-draft entry with no sources is rejected', () => {
  const errs = validateEntry({ ...cited, sources: [] });
  assert.ok(errs.some((e) => e.includes('at least one citation')));
});

test('a spec without a footnote is rejected unless the entry is a draft', () => {
  const unfooted = { ...cited, specs: [{ name: 'Head bolts', value: '65' }] };
  assert.ok(validateEntry(unfooted).some((e) => e.includes('src footnote')));
  assert.deepEqual(validateEntry({ ...unfooted, status: 'draft', sources: [] }), []);
});

test('a footnote pointing past the source list is rejected', () => {
  const bad = { ...cited, specs: [{ name: 'x', value: '1', src: [2] }] };
  assert.ok(validateEntry(bad).some((e) => e.includes('src footnote')));
});

test('shop-verified needs a named shop', () => {
  assert.ok(validateEntry({ ...cited, status: 'shop-verified' }).some((e) => e.includes('verifiedBy')));
});

test('vehicle matching respects make, year range and model', () => {
  assert.equal(applies(cited, { year: 1970, make: 'chevrolet', model: 'C10' }), true);
  assert.equal(applies(cited, { year: 1973, make: 'CHEVROLET', model: 'C10' }), false);
  assert.equal(applies(cited, { year: 1970, make: 'FORD', model: 'C10' }), false);
  assert.equal(applies(cited, { year: 1970, make: 'CHEVROLET', model: 'CAMARO' }), false);
});

test('exclude carves sibling models out of a model match', () => {
  const rogue = { applies: [{ make: 'NISSAN', models: ['ROGUE'], exclude: ['ROGUE SPORT'], years: [2014, 2018] }] };
  assert.equal(applies(rogue, { year: 2017, make: 'NISSAN', model: 'ROGUE' }), true);
  assert.equal(applies(rogue, { year: 2017, make: 'NISSAN', model: 'ROGUE SPORT' }), false);
  assert.ok(validateEntry({ ...cited, applies: [{ make: 'NISSAN', exclude: 'ROGUE SPORT', years: [2014, 2018] }] }).some((e) => e.includes('exclude')));
});

test('published procedure steps must each be footnoted', () => {
  const proc = { ...cited, type: 'procedure', specs: undefined, steps: [{ text: 'Do a thing', src: [1] }, 'Do another thing'] };
  assert.ok(validateEntry(proc).some((e) => e.startsWith('steps[1]')));
  assert.deepEqual(validateEntry({ ...proc, steps: [{ text: 'Do a thing', src: [1] }] }), []);
});

test('photos need a caption, a credit and a path inside media/', () => {
  const ok = { ...cited, photos: [{ file: 'media/test-entry/abc-1234.jpg', caption: 'Bolt location', credit: 'Shop' }] };
  assert.deepEqual(validateEntry(ok), []);
  assert.ok(validateEntry({ ...ok, photos: [{ file: '../../etc/passwd', caption: 'x', credit: 'y' }] }).some((e) => e.includes('photos[0].file')));
  assert.ok(validateEntry({ ...ok, photos: [{ file: 'media/test-entry/a.jpg' }] }).some((e) => e.includes('caption')));
});

test('DTC lookup: majority definition first, footnoted, structure from the code', () => {
  const p0420 = lookup('p0420');
  assert.match(p0420.definitions[0].title, /Catalyst/i);
  assert.ok(p0420.definitions[0].src.length >= 2);
  assert.equal(p0420.generic, true);
  const mfr = lookup('P1131');
  assert.equal(mfr.generic, false);
  assert.ok(mfr.makes.length > 0);
  assert.equal(lookup('XYZ').valid, false);
});

test('DTC generic classification follows SAE J2012 structure', () => {
  assert.equal(isGeneric('P0300'), true);
  assert.equal(isGeneric('P2187'), true);
  assert.equal(isGeneric('P1000'), false);
  assert.equal(isGeneric('P3400'), true);
  assert.equal(isGeneric('P3000'), false);
  assert.equal(isGeneric('U0100'), true);
  assert.equal(isGeneric('B1000'), false);
});

test('DTC text search finds codes by words', () => {
  const hits = search('catalyst efficiency');
  assert.ok(hits.some((h) => h.code === 'P0420'));
});

test('video sources: creator required, timestamps valid and tied to a video, never factory-sourced', () => {
  const vid = { type: 'video', title: 'Cam phaser swap', creator: 'Some Channel', url: 'https://www.youtube.com/watch?v=abc' };
  const proc = { ...cited, type: 'procedure', specs: undefined, sources: [vid], steps: [{ text: 'Remove the valve cover', src: [1], t: '4:32' }] };
  assert.deepEqual(validateEntry(proc), []);
  assert.ok(validateEntry({ ...proc, sources: [{ ...vid, creator: undefined }] }).some((e) => e.includes('creator')));
  assert.ok(validateEntry({ ...proc, steps: [{ text: 'x', src: [1], t: '4m32' }] }).some((e) => e.includes('timestamp')));
  assert.ok(validateEntry({ ...proc, status: 'factory-sourced' }).some((e) => e.includes('factory-sourced')));
  const doc = { ...proc, sources: [{ title: 'Manual' }] };
  assert.ok(validateEntry(doc).some((e) => e.includes('needs a video source')));
});

test('symptom text becomes shop concepts and codes', () => {
  const c = concepts('rattles for a few seconds on cold start, check engine light P0016').map((x) => x[0]);
  assert.deepEqual(c, ['rattle', 'check engine', 'cold start']);
  assert.deepEqual(codesIn('throws p0171 and P0174'), ['P0171', 'P0174']);
  assert.ok(!concepts('cold start rattle').some((x) => x[0] === 'no start'));
  assert.ok(score('ENGINE RATTLING ON STARTUP', concepts('rattles on cold start'), []) >= 2);
});

test('free text parses into year, make, model and problem', async () => {
  const makes = async () => ['CHEVROLET', 'FORD'];
  const models = async (y, m) => (m === 'FORD' ? ['F-150 REGULAR CAB', 'F-150 SUPER CREW', 'F-250'] : ['SILVERADO 1500', 'EQUINOX']);
  assert.deepEqual(await parse('2013 Ford F-150 Super Crew rattles', makes, models), { year: '2013', make: 'FORD', model: 'F-150 SUPER CREW', q: 'rattles' });
  assert.deepEqual(await parse('2010 chevy equinox burning oil', makes, models), { year: '2010', make: 'CHEVROLET', model: 'EQUINOX', q: 'burning oil' });
  assert.equal((await parse('2012 Silverado 1500 tick', makes, models)).make, 'CHEVROLET');
  assert.ok((await parse('it rattles', makes, models)).error);
});

test('EPA model matching uses the base model token', () => {
  const epa = ['F150 Pickup 2WD', 'F150 Pickup 4WD', 'Fiesta', 'Focus FWD'];
  assert.deepEqual(matchModels('F-150 SUPER CREW', epa), ['F150 Pickup 2WD', 'F150 Pickup 4WD']);
});

test('classic catalog fills pre-1981 gaps', () => {
  assert.ok(classicModels(1968, 'chevrolet').includes('CHEVELLE'));
  assert.ok(!classicModels(1963, 'chevrolet').includes('CHEVELLE'));
});
