'use strict';
// Doctor schedule rules shared by the API and unit tests. Weekday: 0 = Sunday ... 6 = Saturday.
const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60];
const toMinutes = value => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::\d{2})?$/.exec(String(value));
  if (!match) throw new Error('Times must be in HH:MM format.');
  return Number(match[1]) * 60 + Number(match[2]);
};
const toTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const weekdayOf = date => new Date(`${date}T00:00:00Z`).getUTCDay();

function validateSchedule(days) {
  if (!Array.isArray(days) || days.length > 7) throw new Error('Send at most one working-hours entry per weekday.');
  const seen = new Set();
  return days.map(day => {
    const weekday = Number(day.weekday), slot = Number(day.slot_minutes ?? 30);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Weekday must be 0 (Sunday) to 6 (Saturday).');
    if (seen.has(weekday)) throw new Error('A weekday can only appear once.');
    seen.add(weekday);
    if (!SLOT_LENGTHS.includes(slot)) throw new Error(`Slot length must be one of ${SLOT_LENGTHS.join(', ')} minutes.`);
    const start = toMinutes(day.start_time), end = toMinutes(day.end_time);
    if (end - start < slot) throw new Error('Finish time must leave room for at least one appointment slot.');
    return { weekday, start_time: toTime(start), end_time: toTime(end), slot_minutes: slot };
  });
}

function generateSlots(entry, booked = []) {
  const taken = new Set(booked.map(time => toTime(toMinutes(time))));
  const slots = [];
  for (let t = toMinutes(entry.start_time); t + entry.slot_minutes <= toMinutes(entry.end_time); t += entry.slot_minutes) {
    if (!taken.has(toTime(t))) slots.push(toTime(t));
  }
  return slots;
}

function checkSlot(entry, time) {
  if (!entry) return { ok: false, reason: 'The doctor is not scheduled to work on this day.' };
  const t = toMinutes(time), start = toMinutes(entry.start_time);
  if (t < start || t + entry.slot_minutes > toMinutes(entry.end_time) || (t - start) % entry.slot_minutes !== 0) {
    return { ok: false, reason: 'That time is outside the doctor\'s working slots.' };
  }
  return { ok: true };
}

module.exports = { SLOT_LENGTHS, validateSchedule, generateSlots, checkSlot, weekdayOf };
