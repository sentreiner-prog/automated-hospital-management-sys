'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lineTotal, bedDays, matchFees, findMissing, missingByPatient } = require('../billing');

const reg = { id: 1, category: 'Registration', name: 'Registration card', amount: 10000, unit: 'once', compulsory: true, active: true, effective_from: '2026-11-01' };
const con = { id: 2, category: 'Consultation', name: 'Consultation', amount: 25000, unit: 'visit', compulsory: true, active: true, effective_from: '2026-11-01' };
const fees = [reg, con, { id: 3, category: 'Medicine', name: 'Amoxicillin 500mg', amount: 500, unit: 'unit', compulsory: false, active: true, effective_from: '2026-11-01' }];
const grace = { id: 'P-001', created_at: '2026-11-05T08:00:00Z' };

test('lineTotal multiplies unit price by quantity', () => {
  assert.equal(lineTotal(500, 20), 10000);
});
test('lineTotal rejects zero quantity and negative or fractional prices', () => {
  assert.throws(() => lineTotal(500, 0), /Quantity/);
  assert.throws(() => lineTotal(-1, 1), /Unit price/);
  assert.throws(() => lineTotal(10.5, 1), /Unit price/);
});
test('bedDays charges at least one day and rounds part days up', () => {
  assert.equal(bedDays('2026-11-05T08:00:00Z', '2026-11-05T10:00:00Z'), 1);
  assert.equal(bedDays('2026-11-05T08:00:00Z', '2026-11-06T08:00:00Z'), 1);
  assert.equal(bedDays('2026-11-05T08:00:00Z', '2026-11-06T09:00:00Z'), 2);
  assert.equal(bedDays('2026-11-05T08:00:00Z', '2026-11-08T08:00:00Z'), 3);
});
test('bedDays rejects a discharge before admission', () => {
  assert.throws(() => bedDays('2026-11-06T08:00:00Z', '2026-11-05T08:00:00Z'), /earlier/);
});
test('matchFees finds a fee by category and name ignoring case', () => {
  assert.deepEqual(matchFees(fees, { category: 'Medicine', name: ' amoxicillin 500MG ' }).map(f => f.id), [3]);
});
test('matchFees with compulsory returns only compulsory fees of the category', () => {
  assert.deepEqual(matchFees(fees, { category: 'Consultation', compulsory: true }).map(f => f.id), [2]);
  assert.deepEqual(matchFees(fees, { category: 'Medicine', compulsory: true }), []);
});
test('matchFees ignores inactive fees', () => {
  assert.deepEqual(matchFees([{ ...reg, active: false }], { category: 'Registration' }), []);
});
test('a newly registered patient without a registration line is missing the card fee', () => {
  const result = findMissing({ patients: [grace], lines: [], appointments: [], fees });
  assert.deepEqual(result.missingOnce.map(m => m.fee), ['Registration card']);
});
test('a patient registered before the effective date is not required to pay the card fee', () => {
  const old = { id: 'P-000', created_at: '2026-09-01T08:00:00Z' };
  assert.equal(findMissing({ patients: [old], lines: [], appointments: [], fees }).missingOnce.length, 0);
});
test('a charged registration fee (even if waived) clears the gap', () => {
  const lines = [{ patient_id: 'P-001', fee_id: 1, visit_date: '2026-11-05' }];
  assert.equal(findMissing({ patients: [grace], lines, appointments: [], fees }).missingOnce.length, 0);
});
test('consultation is checked per visit date, so only the uncharged visit is missing', () => {
  const appointments = [
    { patient_id: 'P-001', date: '2026-11-05', status: 'Completed' },
    { patient_id: 'P-001', date: '2026-11-09', status: 'Checked in' }];
  const lines = [{ patient_id: 'P-001', fee_id: 2, visit_date: '2026-11-05' }, { patient_id: 'P-001', fee_id: 1, visit_date: '2026-11-05' }];
  const result = findMissing({ patients: [grace], lines, appointments, fees });
  assert.deepEqual(result.missingVisit.map(m => m.date), ['2026-11-09']);
});
test('booked, missed and cancelled appointments do not need a consultation fee', () => {
  const appointments = ['Booked', 'Confirmed', 'Missed', 'Cancelled'].map(status => ({ patient_id: 'P-001', date: '2026-11-09', status }));
  assert.equal(findMissing({ patients: [], lines: [], appointments, fees }).missingVisit.length, 0);
});
test('two visits on the same day count once', () => {
  const appointments = [{ patient_id: 'P-001', date: '2026-11-09', status: 'Completed' }, { patient_id: 'P-001', date: '2026-11-09', status: 'Checked in' }];
  assert.equal(findMissing({ patients: [], lines: [], appointments, fees }).missingVisit.length, 1);
});
test('missingByPatient lists readable gaps per patient', () => {
  const map = missingByPatient({ missingOnce: [{ patient_id: 'P-001', fee: 'Registration card' }], missingVisit: [{ patient_id: 'P-001', fee: 'Consultation', date: '2026-11-09' }] });
  assert.deepEqual(map.get('P-001'), ['Registration card', 'Consultation (2026-11-09)']);
});
