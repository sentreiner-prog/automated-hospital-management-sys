'use strict';
// Reason for visit -> doctor specialties that fit it. The first specialty is the best match.
// Matching is guidance only: staff may book any doctor, and an override is written to the audit log.
const REASONS = [
  { id: 'general',  label: 'General illness (fever, cough, pain)',          specialties: ['General Practice', 'Internal Medicine'] },
  { id: 'child',    label: 'Child health',                                  specialties: ['Paediatrics', 'General Practice'] },
  { id: 'women',    label: 'Pregnancy or women’s health',                   specialties: ['Obstetrics and Gynaecology', 'General Practice'] },
  { id: 'chronic',  label: 'Long-term condition (diabetes, blood pressure)', specialties: ['Internal Medicine', 'General Practice'] },
  { id: 'surgical', label: 'Injury or surgical problem',                    specialties: ['Surgery', 'General Practice'] },
  { id: 'other',    label: 'Other or not sure',                             specialties: [] }
];
const findReason = id => REASONS.find(reason => reason.id === id);
const isValidReason = id => Boolean(findReason(id));

// 'best' = first listed specialty, 'ok' = another fitting specialty (or any, for "other"),
// 'other' = specialty does not fit, null = unknown reason.
function matchLevel(reasonId, specialty) {
  const reason = findReason(reasonId);
  if (!reason) return null;
  if (!reason.specialties.length) return 'ok';
  const index = reason.specialties.findIndex(item => item.toLowerCase() === String(specialty || '').trim().toLowerCase());
  return index === 0 ? 'best' : index > 0 ? 'ok' : 'other';
}

function rankDoctors(reasonId, doctors) {
  const order = { best: 0, ok: 1, other: 2 };
  return doctors
    .map(doctor => ({ ...doctor, match: matchLevel(reasonId, doctor.specialty) }))
    .sort((a, b) => (order[a.match] ?? 3) - (order[b.match] ?? 3) || String(a.name).localeCompare(String(b.name)));
}

module.exports = { REASONS, findReason, isValidReason, matchLevel, rankDoctors };
