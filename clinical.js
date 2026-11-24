'use strict';

function calculateNews2(observation) {
  const values = {
    respiratory_rate: Number(observation.respiratory_rate),
    oxygen_saturation: Number(observation.oxygen_saturation),
    systolic_blood_pressure: Number(observation.systolic_blood_pressure),
    pulse_rate: Number(observation.pulse_rate),
    temperature: Number(observation.temperature)
  };
  const ranges = {
    respiratory_rate: [1, 80],
    oxygen_saturation: [50, 100],
    systolic_blood_pressure: [40, 300],
    pulse_rate: [20, 250],
    temperature: [25, 45]
  };
  for (const [name, value] of Object.entries(values)) {
    const [minimum, maximum] = ranges[name];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`Enter a valid ${name.replaceAll('_', ' ')} measurement.`);
    }
  }
  if (observation.spo2_scale !== undefined && Number(observation.spo2_scale) !== 1) {
    throw new Error('This prototype only supports NEWS2 SpO2 Scale 1. Do not use it for patients requiring Scale 2.');
  }
  const scores = {
    respiratory_rate: values.respiratory_rate <= 8 ? 3 : values.respiratory_rate <= 11 ? 1 :
      values.respiratory_rate <= 20 ? 0 : values.respiratory_rate <= 24 ? 2 : 3,
    oxygen_saturation: values.oxygen_saturation <= 91 ? 3 : values.oxygen_saturation <= 93 ? 2 :
      values.oxygen_saturation <= 95 ? 1 : 0,
    systolic_blood_pressure: values.systolic_blood_pressure <= 90 ? 3 :
      values.systolic_blood_pressure <= 100 ? 2 : values.systolic_blood_pressure <= 110 ? 1 :
        values.systolic_blood_pressure <= 219 ? 0 : 3,
    pulse_rate: values.pulse_rate <= 40 ? 3 : values.pulse_rate <= 50 ? 1 :
      values.pulse_rate <= 90 ? 0 : values.pulse_rate <= 110 ? 1 :
        values.pulse_rate <= 130 ? 2 : 3,
    temperature: values.temperature <= 35 ? 3 : values.temperature <= 36 ? 1 :
      values.temperature <= 38 ? 0 : values.temperature <= 39 ? 1 : 2,
    consciousness: observation.consciousness === 'Alert' ? 0 : 3,
    supplemental_oxygen: observation.supplemental_oxygen === true ? 2 : 0
  };
  if (!['Alert', 'Confusion', 'Voice', 'Pain', 'Unresponsive'].includes(observation.consciousness)) {
    throw new Error('Choose a valid consciousness observation.');
  }
  const score = Object.values(scores).reduce((total, item) => total + item, 0);
  const anyParameterScoreThree = Object.entries(scores).some(([name, item]) =>
    name !== 'supplemental_oxygen' && item === 3);
  return {
    score,
    component_scores: scores,
    escalation: score >= 7 ? 'Emergency clinical review required' :
      score >= 5 || anyParameterScoreThree ? 'Escalate for urgent clinical review' :
        score > 0 ? 'Increase observations and follow local protocol' : 'Continue observations per local protocol',
    requires_escalation: score >= 5 || anyParameterScoreThree,
    prototype_notice: 'Prototype decision support only. Not clinically validated; follow local policy and clinical judgement.'
  };
}

module.exports = { calculateNews2 };
