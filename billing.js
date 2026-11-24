'use strict';
// Billing rules: fee categories, charge maths and the compulsory-fee check. Pure functions, unit-tested.
const CATEGORIES = ['Registration', 'Consultation', 'Diagnostics', 'Bed space', 'Surgery', 'Medicine'];
const UNITS = ['once', 'visit', 'test', 'day', 'procedure', 'unit'];

function lineTotal(unitPrice, quantity) {
  if (!Number.isInteger(unitPrice) || unitPrice < 0) throw new Error('Unit price must be a whole number of UGX, zero or more.');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be a whole number above zero.');
  return unitPrice * quantity;
}

// Bed days = whole or part days between admission and discharge, minimum one.
function bedDays(admittedAt, dischargedAt) {
  const ms = new Date(dischargedAt) - new Date(admittedAt);
  if (!(ms >= 0)) throw new Error('Discharge cannot be earlier than admission.');
  return Math.max(1, Math.ceil(ms / 86400000));
}

// Active fees of a category, optionally by exact name (case-insensitive) and/or compulsory only.
function matchFees(fees, { category, name, compulsory }) {
  const wanted = name === undefined ? null : String(name).trim().toLowerCase();
  return fees.filter(fee => fee.active !== false && fee.category === category && (!compulsory || fee.compulsory) &&
    (wanted === null || String(fee.name).trim().toLowerCase() === wanted));
}

// Which compulsory fees are not yet on a patient's bill?
//  - once-only fees (registration card): every patient registered on or after the fee's effective date
//  - per-visit fees (consultation): every checked-in or completed visit on or after the effective date
function findMissing({ patients, lines, appointments, fees }) {
  const compulsory = fees.filter(fee => fee.active !== false && fee.compulsory);
  const charged = (patientId, fee, date) => lines.some(line => line.patient_id === patientId && line.fee_id === fee.id &&
    (fee.unit !== 'visit' || String(line.visit_date).slice(0, 10) === date));
  const missingOnce = [], missingVisit = [], seen = new Set();
  for (const fee of compulsory.filter(item => item.unit === 'once')) {
    for (const patient of patients) {
      if (String(patient.created_at).slice(0, 10) >= fee.effective_from && !charged(patient.id, fee)) {
        missingOnce.push({ patient_id: patient.id, fee_id: fee.id, fee: fee.name });
      }
    }
  }
  for (const fee of compulsory.filter(item => item.unit === 'visit')) {
    for (const visit of appointments) {
      if (!['Checked in', 'Completed'].includes(visit.status) || visit.date < fee.effective_from) continue;
      const key = `${visit.patient_id}|${visit.date}|${fee.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!charged(visit.patient_id, fee, visit.date)) missingVisit.push({ patient_id: visit.patient_id, date: visit.date, fee_id: fee.id, fee: fee.name });
    }
  }
  return { missingOnce, missingVisit };
}

// Map of patient id -> readable list such as ['Registration card', 'Consultation (2026-11-09)'].
function missingByPatient({ missingOnce, missingVisit }) {
  const map = new Map();
  const add = (id, text) => map.set(id, [...(map.get(id) || []), text]);
  missingOnce.forEach(item => add(item.patient_id, item.fee));
  missingVisit.forEach(item => add(item.patient_id, `${item.fee} (${item.date})`));
  return map;
}

module.exports = { CATEGORIES, UNITS, lineTotal, bedDays, matchFees, findMissing, missingByPatient };
