import { describe, expect, it } from "vitest";
import { enforceServiceScope, isNonServiceableSubject } from "./scope.js";
import type { ModelAssessment } from "./types.js";

const assessment = (overrides: Partial<ModelAssessment> = {}): ModelAssessment => ({
  reply: "I can help with that. How many rooms need cleaning?",
  category: "handyman",
  summary: "User needs carpet cleaning and moving services.",
  issueCandidates: [{ id: "carpet_cleaning", label: "Carpet Cleaning Service", likelihood: "medium", reason: "Customer asked for carpet cleaning.", evidenceNeeded: [] }],
  questions: [{ id: "rooms", prompt: "How many rooms require carpet cleaning?", requiredForSafety: false }],
  materialsHint: ["carpet extractor"],
  details: {},
  safety: { level: "normal", hazards: [], guidance: "" },
  readyToConfirm: false,
  ...overrides,
});

describe("intake service scope", () => {
  it("blocks work WeCover does not perform", () => {
    for (const subject of [
      "Movers to pack the apartment next week.",
      "Car engine knocking and check engine light on.",
      "Cracked laptop screen and phone battery replacement.",
      "Help filing income taxes and a lease dispute letter.",
      "Sell a home warranty and file the insurance claim.",
      "Weather forecast and restaurant recommendation request.",
      "Solicita una empresa de mudanza para empacar el apartamento.",
    ]) expect(isNonServiceableSubject(subject), subject).toBe(true);
  });

  it("keeps every serviceable trade request, including ones that mention unrelated context", () => {
    for (const subject of [
      "Water leak under the kitchen sink soaked the carpet.",
      "Movers damaged the drywall and it needs patching and paint.",
      "Outlets in the living room are dead after the breaker tripped.",
      "Heat pump blows warm air and the condenser is noisy.",
      "Repaint two bedrooms and a hallway before move-in.",
      "Roaches in the kitchen and droppings behind the fridge.",
      "Bedroom door will not latch and the hinge screws back out.",
      "Fuga debajo del fregadero de la cocina.",
      "The tenant's lease dispute is unrelated; the toilet runs constantly.",
      "Deep cleaning for a three-bedroom home with carpet shampoo.",
      "Tree removal and landscaping in the back yard.",
      "Install shelves and assemble two pieces of furniture.",
    ]) expect(isNonServiceableSubject(subject), subject).toBe(false);
  });

  it.each([
    "Help with moving boxes to a new apartment",
    "Fix my car's brakes",
    "Deliver my new fridge",
    "Repair my iPhone screen",
    "Wifi router not working, internet down",
    "Smart TV not turning on",
    "Dishwasher delivery",
    "Reparar mi computadora",
    "my car battery is dead",
    "oil change for my SUV",
    "fix my PS5",
    "my laptop won't boot",
    "internet is down, call Comcast",
    "can you move my piano to the new house",
    "entrega de muebles",
    "mi celular no prende"
])("declines explicit out-of-scope request: %s", (subject) => {
    expect(isNonServiceableSubject(subject)).toBe(true);
    const result = enforceServiceScope(assessment({ summary: subject, readyToConfirm: true }), "en");
    expect(result.issueCandidates).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.materialsHint).toEqual([]);
    expect(result.readyToConfirm).toBe(false);
    expect(result.reply).toContain("outside WeCover's home services");
  });

  it.each([
    "Fix my computer desk drawer",
    "Internet is down because a contractor cut the cable in the wall",
    "Install outlets for my home office computer",
    "TV not turning on after power outage, outlet dead?",
    "Move my washer to the basement and hook it up",
    "Replace the battery in my smoke detector",
    "Kitchen sink drain leak, replace P-trap",
    "Assemble IKEA furniture",
    "Lawn mowing and yard cleanup",
    "Install a ceiling fan",
    "Pest control for ants",
    "Junk removal old couch",
    "TV mounting on wall",
    "Replace dishwasher",
    "Water heater leaking and furniture damaged",
    "Install an EV charger in my garage",
    "Garage door opener not working",
    "Dryer vent cleaning",
    "Install a smart thermostat",
    "Run ethernet cable through the wall",
    "Mount my TV and hide the wires",
    "Move-out cleaning for my apartment",
    "Haul away my old fridge",
    "Install the dishwasher I just bought",
    "car port roof is leaking",
    "fuga en el baño",
    "instalar ventilador de techo"
])("accepts home service request: %s", (subject) => {
    expect(isNonServiceableSubject(subject)).toBe(false);
  });

  it("removes the request path for out-of-scope work instead of scoping it", () => {
    const result = enforceServiceScope(assessment({
      summary: "Movers to pack the apartment next week.",
      issueCandidates: [{ id: "moving", label: "Moving and packing service", likelihood: "medium", reason: "Customer requested movers.", evidenceNeeded: [] }],
    }), "en");
    expect(result.issueCandidates).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.materialsHint).toEqual([]);
    expect(result.readyToConfirm).toBe(false);
    expect(result.reply).toContain("outside WeCover's home services");
    expect(result.reply).not.toContain("I can help");
  });

  it("answers an out-of-scope request in the requested locale", () => {
    expect(enforceServiceScope(assessment({
      summary: "Empresa de mudanza para empacar.",
      issueCandidates: [{ id: "mudanza", label: "Servicio de mudanza", likelihood: "medium", reason: "Solicita empacar el apartamento.", evidenceNeeded: [] }],
    }), "es").reply).toContain("fuera de los servicios");
  });

  it("never replaces emergency guidance with the scope notice", () => {
    const emergency = enforceServiceScope(assessment({
      reply: "Leave the area and call 911.",
      summary: "Movers are packing the apartment during an active fire.",
      issueCandidates: [{ id: "moving", label: "Moving service", likelihood: "medium", reason: "Customer requested movers.", evidenceNeeded: [] }],
      safety: { level: "emergency", hazards: ["fire"], guidance: "Leave now." },
    }), "en");
    expect(emergency.reply).toBe("Leave the area and call 911.");
    expect(emergency.issueCandidates).toEqual([]);
    expect(emergency.readyToConfirm).toBe(false);
  });

  it("leaves a serviceable assessment untouched", () => {
    const plumbing = assessment({
      summary: "Toilet runs constantly and the water bill went up.",
      issueCandidates: [{ id: "flapper", label: "Worn flapper", likelihood: "medium", reason: "Continuous refill.", evidenceNeeded: [] }],
      reply: "Let us scope the running toilet.",
    });
    expect(enforceServiceScope(plumbing, "en")).toEqual(plumbing);
  });
});
