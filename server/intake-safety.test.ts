/**
 * safety 패턴 탐지와 enforceSafetyFloor 격상 테스트.
 */
import { describe, expect, it } from "vitest";
import { emergencyGuidance } from "./intake/emergency.js";
import { enforceSafetyFloor } from "./intake/safety.js";
import type { ModelAssessment } from "./intake/types.js";

const assessment = (): ModelAssessment => ({
  reply: "Please describe the problem.", category: "handyman", summary: "Reported household problem",
  issueCandidates: [], questions: [], details: {},
  safety: { level: "normal", hazards: [], guidance: "" }, readyToConfirm: false,
});
const emergencyCases = [
  ["No gas smell but smoke from outlet", "fire"],
  ["No gas smell, but smoke is coming out", "fire"],
  ["No gas smell, smoke is coming from outlet", "fire"],
  ["No gas smell, smoke coming from the outlet", "fire"],
  ["No gas smell, smoke from the outlet", "fire"],
  ["No gas smell, smoke billows from the outlet", "fire"],
  ["No gas smell, water is rising rapidly", "severe_flooding"],
  ["No hay olor a gas, humo saliendo del enchufe", "fire"],
  ["No hay olor a gas, sale humo del enchufe", "fire"],
  ["No gas smell. Smoke in the kitchen", "fire"],
  ["No gas smell, structural damage, but smoke is visible", "fire"],
  ["No hay olor a gas, sale humo del enchufe", "fire"],
  ["No smoke and I smell gas", "gas"],
  ["No hay olor a gas pero salen chispas del enchufe", "electrical"],
  ["Sin humo, el agua sube rápidamente", "severe_flooding"],
  ["There is a gas smell", "gas"],
  ["Huele a gas en la cocina", "gas"],
  ["Huelo a gas cerca del calentador.", "gas"],
  ["Olemos a gas en la cocina", "gas"],
  ["There are flames near the heater", "fire"],
  ["Hay humo en la cocina", "fire"],
  ["Sparks are coming from the outlet", "electrical"],
  ["Hay cables expuestos con corriente", "electrical"],
  ["The ceiling is falling", "structural"],
  ["El techo se está cayendo", "structural"],
  ["Water is rising rapidly", "severe_flooding"],
  ["Hay una inundación grave", "severe_flooding"],
  ["The smoke detector is beeping and smoke is coming from the outlet", "fire"],
  ["I am not sure if I smell gas", "gas"],
  ["No puedo descartar olor a gas", "gas"],
  ["There was smoke yesterday", "fire"],
  ["The fire has not been extinguished", "fire"],
] as const;
const normalCases = [
  "There is no gas smell, smoke, sparks, electrical exposure, structural damage or severe flooding.",
  ...['electrical exposure', 'structural damage', 'visible damage', 'unusual noises'].map(noun => 'There is no gas smell, ' + noun + ', smoke, sparks or severe flooding.'),
  ...['exposicion electrica', 'danos estructurales', 'danos visibles', 'ruidos extranos'].map(noun => 'No hay olor a gas, ' + noun + ', humo, chispas ni inundacion grave.'),
  "No gas smell, smoke, sparks, electrical contact, standing water or flooding",
  "No hay olor a gas, humo, chispas, contacto electrico ni inundacion",
  "No smoke or gas smell", "No smoke or sparks", "No hay humo ni chispas",
  "No gas smell", "I do not smell gas", "There is no smoke", "No sparks",
  "No hay humo", "No huele a gas", "Sin olor a gas", "No hay chispas",
  "The smoke detector battery is beeping", "The smoke alarm needs a battery",
  "El detector de humo necesita pilas", "The faucet is dripping",
  "Last year the fire was extinguished by the fire department",
];

describe("deterministic intake safety floor", () => {
  it.each(emergencyCases)("stops intake when user reports %s", (content, hazard) => {
    const result = enforceSafetyFloor(assessment(), [{ role: "user", content }], "en");
    expect(result.safety.level).toBe("emergency");
    expect(result.safety.hazards).toContain(hazard);
    expect(result.readyToConfirm).toBe(false);
  });
  it.each(normalCases)("does not invent danger when user reports %s", (content) => {
    expect(enforceSafetyFloor(assessment(), [{ role: "user", content }], "en").safety.level).toBe("normal");
  });
  it("ignores assistant warnings as evidence", () => {
    expect(enforceSafetyFloor(assessment(), [{ role: "assistant", content: "Do you smell gas or see smoke?" }], "en").safety.level).toBe("normal");
  });
  it("retains every simultaneous hazard and uses Spanish guidance", () => {
    const result = enforceSafetyFloor(assessment(), [{ role: "user", content: "Huele a gas y hay humo" }], "es");
    expect(result.safety.hazards).toEqual(expect.arrayContaining(["gas", "fire"]));
    expect(result.reply).toContain("Detente");
  });
  it("never downgrades an emergency identified from media by the model", () => {
    const current = assessment();
    current.safety = { level: "emergency", hazards: ["electrical"], guidance: "Leave safely." };
    expect(enforceSafetyFloor(current, [{ role: "user", content: "No smoke" }], "en").safety).toEqual(current.safety);
  });
  it.each([
    ["en", "I smell gas near the furnace", "Stop, move away from the danger, and call 911 or the appropriate public utility. Do not continue online diagnosis.", "Leave the area if you can do so safely and contact emergency services or the public utility."],
    ["es", "Huelo a gas cerca del calentador", "Detente, aléjate del peligro y llama al 911 o a la empresa pública correspondiente. No continúes con el diagnóstico en línea.", "Sal del área si puedes hacerlo con seguridad y contacta a los servicios de emergencia o a la empresa pública."],
  ] as const)("uses deterministic %s emergency-first guidance", (locale, content, reply, guidance) => {
    const model = assessment();
    model.reply = "Continue routine remote diagnosis.";
    model.readyToConfirm = true;
    const result = enforceSafetyFloor(model, [{ role: "user", content }], locale);
    expect(result).toMatchObject({
      reply,
      safety: { level: "emergency", hazards: ["gas"], guidance },
      readyToConfirm: false,
    });
  });
});

// The 41 persona baseline observations, with CO mapped to the existing gas category.
const baselineCases = [
  ["I smell gas in the kitchen", "gas", "en"],
  ["There's a strong gas smell near the stove", "gas", "en"],
  ["it smells like gas", "gas", "en"],
  ["my house smells of natural gas", "gas", "en"],
  ["I can smell something like rotten eggs near the water heater", "gas", "en"],
  ["carbon monoxide detector is going off", "gas", "en"],
  ["the CO alarm keeps beeping", "gas", "en"],
  ["the outlet is sparking when I plug things in", "electrical", "en"],
  ["I see sparks coming from the outlet", "electrical", "en"],
  ["the outlet is sparking", "electrical", "en"],
  ["burning smell coming from the breaker panel", "electrical", "en"],
  ["the outlet feels hot and smells burnt", "electrical", "en"],
  ["I got shocked when I touched the toaster", "electrical", "en"],
  ["the wire is exposed and hanging from the ceiling", "electrical", "en"],
  ["water is flooding my basement fast", "severe_flooding", "en"],
  ["a pipe burst and water is pouring everywhere", "severe_flooding", "en"],
  ["the basement is flooding", "severe_flooding", "en"],
  ["water is rising rapidly", "severe_flooding", "en"],
  ["the ceiling is sagging and about to collapse", "structural", "en"],
  ["there is smoke coming out of the vent", "fire", "en"],
  ["the wall is on fire", "fire", "en"],
  ["there are flames", "fire", "en"],
  ["no gas smell, just a dripping faucet", null, "en"],
  ["I have a smoke detector that chirps", null, "en"],
  ["there is no smoke and no sparks", null, "en"],
  ["I do not smell gas", null, "en"],
  ["my gas stove igniter clicks but no flame", null, "en"],
  ["fire department inspected last week", null, "en"],
  ["huele a gas en la cocina", "gas", "es"],
  ["siento olor a gas", "gas", "es"],
  ["hay chispas en el enchufe", "electrical", "es"],
  ["el enchufe echa chispas", "electrical", "es"],
  ["hay mucho humo", "fire", "es"],
  ["se esta inundando el sotano", "severe_flooding", "es"],
  ["el techo se esta cayendo", "structural", "es"],
  ["no hay olor a gas", null, "es"],
  ["가스 냄새가 나요", "gas", "en"],
  ["콘센트에서 불꽃이 튀어요", "electrical", "en"],
  ["집에 불이 났어요", "fire", "en"],
  ["물이 계속 차올라요", "severe_flooding", "en"],
  ["수도꼭지가 똑똑 떨어져요", null, "en"]
] as const;

it.each(baselineCases)("classifies baseline: %s", (content, hazard, locale) => {
  const result = enforceSafetyFloor(assessment(), [{ role: "user", content }], locale);
  expect(result.safety.hazards).toEqual(hazard ? [hazard] : []);
  expect(result.safety.level).toBe(hazard ? "emergency" : "normal");
  const emergency = emergencyGuidance({
    history: [{ role: "user", content }], locale, actorId: "public", now: new Date("2026-10-28T00:00:00Z"),
  });
  expect(emergency?.response.safety.hazards).toEqual(hazard ? [hazard] : undefined);
});
it.each([
  ["The CO alarm needs a new battery", null],
  ["Install a carbon monoxide detector", null],
  ["The outlet is not sparking", null],
  ["There is no exposed wiring", null],
  ["No rotten egg smell", null],
  ["No hay cables expuestos", null],
  ["El detector de monóxido de carbono suena", "gas"],
  ["El enchufe está caliente", "electrical"],
  ["El techo se está hundiendo", "structural"],
  ["일산화탄소 경보기가 울려요", "gas"],
  ["전선이 노출되어 있어요", "electrical"],
  ["천장이 무너지고 있어요", "structural"],
] as const)("classifies additional observation: %s", (content, hazard) => {
  const result = enforceSafetyFloor(assessment(), [{ role: "user", content }], "en");
  expect(result.safety.hazards).toEqual(hazard ? [hazard] : []);
});

// Follow-up personas: current hazards remain urgent; past observations stay local.
it.each([
  ["천장이 처져요", "structural"],
  ["huele a huevos podridos cerca del calentador", "gas"],
  ["we had a burst pipe last year, now just a slow drip", null],
  ["i used to smell rotten eggs but plumber fixed it", null],
  ["pipe burst!! water everywhere pls hurry", "severe_flooding"],
  ["grandma here.. smell gas maybe? not sure", "gas"],
  ["the co alarm is beeping because battery low", "gas"],
  ["지하실이 침수됐어요", "severe_flooding"],
  ["my co worker said the faucet leaks", null],
  ["the outlet is not hot anymore, just loose", null],
  ["no sparking, the switch just clicks", null],
  ["we had a burst pipe last year, but the basement is flooding", "severe_flooding"],
  ["i used to smell rotten eggs but now I smell gas", "gas"],
] as const)("classifies follow-up observation: %s", (content, hazard) => {
  const result = enforceSafetyFloor(assessment(), [{ role: "user", content }], "en");
  expect(result.safety.hazards).toEqual(hazard ? [hazard] : []);
  expect(result.safety.level).toBe(hazard ? "emergency" : "normal");
});
