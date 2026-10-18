import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, applies } from '../server/kb.js';
import { lookup } from '../server/dtc.js';
import { matchModels } from '../server/sources/epa.js';
import { classicModels } from '../server/catalog.js';

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

test('DTC lookup: exact, family, manufacturer-specific, invalid', () => {
  assert.match(lookup('p0420').title, /Catalyst/);
  assert.equal(lookup('P0304').title, 'Cylinder 4 misfire detected');
  assert.match(lookup('P0353').title, /coil C/);
  const mfr = lookup('P1131');
  assert.equal(mfr.known, false);
  assert.equal(mfr.generic, false);
  assert.equal(lookup('XYZ').valid, false);
});

test('EPA model matching uses the base model token', () => {
  const epa = ['F150 Pickup 2WD', 'F150 Pickup 4WD', 'Fiesta', 'Focus FWD'];
  assert.deepEqual(matchModels('F-150 SUPER CREW', epa), ['F150 Pickup 2WD', 'F150 Pickup 4WD']);
});

test('classic catalog fills pre-1981 gaps', () => {
  assert.ok(classicModels(1968, 'chevrolet').includes('CHEVELLE'));
  assert.ok(!classicModels(1963, 'chevrolet').includes('CHEVELLE'));
});
