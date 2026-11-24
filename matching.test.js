'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { REASONS, isValidReason, matchLevel, rankDoctors } = require('../matching');

const doctors = [
  { name: 'Dr. Okello', specialty: 'General Practice' },
  { name: 'Dr. Achieng', specialty: 'Paediatrics' },
  { name: 'Dr. Nabirye', specialty: 'Obstetrics and Gynaecology' }
];

test('child health: paediatrics is the best match', () => {
  assert.equal(matchLevel('child', 'Paediatrics'), 'best');
});
test('child health: general practice is suitable but not best', () => {
  assert.equal(matchLevel('child', 'General Practice'), 'ok');
});
test('child health: obstetrics does not fit', () => {
  assert.equal(matchLevel('child', 'Obstetrics and Gynaecology'), 'other');
});
test('specialty comparison ignores case and surrounding spaces', () => {
  assert.equal(matchLevel('child', '  paediatrics '), 'best');
});
test('"other or not sure" accepts every specialty', () => {
  assert.equal(matchLevel('other', 'Surgery'), 'ok');
});
test('unknown reason is invalid and has no match level', () => {
  assert.equal(isValidReason('flu'), false);
  assert.equal(matchLevel('flu', 'Paediatrics'), null);
});
test('rankDoctors lists best matches first, then suitable, then other', () => {
  const ranked = rankDoctors('child', doctors);
  assert.deepEqual(ranked.map(d => d.name), ['Dr. Achieng', 'Dr. Okello', 'Dr. Nabirye']);
  assert.deepEqual(ranked.map(d => d.match), ['best', 'ok', 'other']);
});
test('every reason has a unique id and a label', () => {
  assert.equal(new Set(REASONS.map(r => r.id)).size, REASONS.length);
  assert.ok(REASONS.every(r => r.label.length > 3));
});
