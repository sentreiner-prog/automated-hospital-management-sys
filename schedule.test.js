'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSchedule, generateSlots, checkSlot, weekdayOf } = require('../schedule');

const monday = { weekday: 1, start_time: '08:00', end_time: '10:00', slot_minutes: 30 };

test('weekdayOf maps ISO dates to 0=Sunday..6=Saturday', () => {
  assert.equal(weekdayOf('2026-11-08'), 0);
  assert.equal(weekdayOf('2026-11-09'), 1);
});
test('generateSlots creates back-to-back slots inside working hours', () => {
  assert.deepEqual(generateSlots(monday), ['08:00', '08:30', '09:00', '09:30']);
});
test('generateSlots removes slots that are already booked', () => {
  assert.deepEqual(generateSlots(monday, ['08:30', '09:30']), ['08:00', '09:00']);
});
test('checkSlot accepts a valid slot start', () => {
  assert.equal(checkSlot(monday, '09:00').ok, true);
});
test('checkSlot rejects times outside working hours', () => {
  assert.equal(checkSlot(monday, '07:30').ok, false);
  assert.equal(checkSlot(monday, '10:00').ok, false);
});
test('checkSlot rejects times that do not start on a slot boundary', () => {
  assert.equal(checkSlot(monday, '08:10').ok, false);
});
test('checkSlot rejects a day with no schedule', () => {
  assert.match(checkSlot(undefined, '09:00').reason, /not scheduled/);
});
test('validateSchedule normalises valid input', () => {
  assert.deepEqual(validateSchedule([{ weekday: '2', start_time: '08:00:00', end_time: '13:00', slot_minutes: '20' }]),
    [{ weekday: 2, start_time: '08:00', end_time: '13:00', slot_minutes: 20 }]);
});
test('validateSchedule rejects duplicate weekdays, bad slot lengths and inverted hours', () => {
  assert.throws(() => validateSchedule([monday, monday]), /only appear once/);
  assert.throws(() => validateSchedule([{ ...monday, slot_minutes: 25 }]), /Slot length/);
  assert.throws(() => validateSchedule([{ ...monday, start_time: '12:00', end_time: '09:00' }]), /room for at least one/);
  assert.throws(() => validateSchedule([{ ...monday, start_time: '8am' }]), /HH:MM/);
});
