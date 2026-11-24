'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateNews2 } = require('../clinical');

const normalObservation = {
  respiratory_rate: 16,
  oxygen_saturation: 98,
  systolic_blood_pressure: 120,
  pulse_rate: 70,
  temperature: 37,
  consciousness: 'Alert',
  supplemental_oxygen: false
};

test('NEWS2 prototype scores normal observations as zero', () => {
  assert.equal(calculateNews2(normalObservation).score, 0);
});

test('NEWS2 adds two points for supplemental oxygen', () => {
  const result = calculateNews2({ ...normalObservation, supplemental_oxygen: true });
  assert.equal(result.score, 2);
  assert.equal(result.component_scores.supplemental_oxygen, 2);
});

test('NEWS2 flags a single parameter scoring three for escalation', () => {
  const result = calculateNews2({ ...normalObservation, respiratory_rate: 8 });
  assert.equal(result.score, 3);
  assert.equal(result.requires_escalation, true);
});

test('NEWS2 flags an aggregate score of six for urgent review', () => {
  const result = calculateNews2({ ...normalObservation, oxygen_saturation: 91, systolic_blood_pressure: 90 });
  assert.equal(result.score, 6);
  assert.match(result.escalation, /urgent clinical review/);
});

test('NEWS2 rejects unsupported Scale 2 rather than returning a misleading score', () => {
  assert.throws(
    () => calculateNews2({ ...normalObservation, spo2_scale: 2 }),
    /only supports NEWS2 SpO2 Scale 1/
  );
});
