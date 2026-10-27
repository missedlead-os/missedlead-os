/**
 * 채팅 방문 희망 시간 구조화(visitTime.ts)와 일정 API 검증(schedule.ts) 테스트.
 */
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, InMemoryRepository, type AuthAdapter } from "./app.js";
import { GeminiIntakeProvider, normalizeModelAssessment, type IntakeAiProvider } from "./intake/provider.js";
import type { AnalyzeInput, ModelAssessment } from "./intake/types.js";
import { applyVisitPreference, resolveVisitPreference, visitClockContext, zonedToUtc } from "./intake/visitTime.js";
import { InMemoryIntakeUsageBudget } from "./intake/usage.js";

// 2026-09-05 12:00Z = Saturday 08:00 in Charlotte (EDT, UTC-4).
const NOW = new Date("2026-09-05T12:00:00.000Z");

const base = (details: Partial<ModelAssessment["details"]> = {}, extra: Partial<ModelAssessment> = {}): ModelAssessment => ({
  reply: "I found a likely drain leak.",
  category: "plumbing",
  summary: "Possible leak beneath the kitchen sink",
  issueCandidates: [{ id: "drain_leak", label: "Drain connection leak", likelihood: "medium", reason: "Water near the drain", evidenceNeeded: [] }],
  questions: [],
  materialsHint: [],
  details: { location: "kitchen", ...details },
  safety: { level: "normal", hazards: [], guidance: "" },
  readyToConfirm: true,
  ...extra,
});

describe("visit time resolution", () => {
  it("converts Charlotte local time to UTC across DST", () => {
    expect(zonedToUtc(2026, 9, 12, 9, 0)?.toISOString()).toBe("2026-09-12T13:00:00.000Z"); // EDT
    expect(zonedToUtc(2026, 12, 12, 9, 0)?.toISOString()).toBe("2026-12-12T14:00:00.000Z"); // EST
    expect(zonedToUtc(2026, 9, 31, 9, 0)).toBeUndefined();
    expect(zonedToUtc(2027, 3, 14, 2, 30)).toBeUndefined(); // spring-forward gap does not exist locally
  });

  it("maps a day plus time window or exact time to one UTC instant and a label", () => {
    const morning = resolveVisitPreference({ visitDate: "2026-09-12", visitWindow: "morning" }, NOW, "en");
    expect(morning).toMatchObject({ status: "ok", desiredTime: "2026-09-12T13:00:00.000Z", label: "Saturday, September 12, morning" });
    const exact = resolveVisitPreference({ visitDate: "2026-09-12", visitTime: "15:00" }, NOW, "en");
    expect(exact).toMatchObject({ status: "ok", desiredTime: "2026-09-12T19:00:00.000Z" });
    expect((exact as { label: string }).label).toMatch(/Saturday, September 12, 3:00\s?PM/);
    const spanish = resolveVisitPreference({ visitDate: "2026-09-12", visitWindow: "afternoon" }, NOW, "es");
    expect(spanish).toMatchObject({ status: "ok", desiredTime: "2026-09-12T17:00:00.000Z" });
    expect((spanish as { label: string }).label).toContain("por la tarde");
  });

  it("rejects past, too-far, partial, and impossible dates", () => {
    expect(resolveVisitPreference({ visitDate: "2026-09-05", visitTime: "07:00" }, NOW, "en").status).toBe("past");
    expect(resolveVisitPreference({ visitDate: "2026-09-01", visitWindow: "evening" }, NOW, "en").status).toBe("past");
    expect(resolveVisitPreference({ visitDate: "2027-09-12", visitWindow: "morning" }, NOW, "en").status).toBe("too_far");
    expect(resolveVisitPreference({ visitDate: "2026-09-12" }, NOW, "en").status).toBe("invalid");
    expect(resolveVisitPreference({ visitWindow: "morning" }, NOW, "en").status).toBe("invalid");
    expect(resolveVisitPreference({ visitDate: "2026-02-30", visitWindow: "morning" }, NOW, "en").status).toBe("invalid");
    expect(resolveVisitPreference({}, NOW, "en").status).toBe("none");
  });

  it("gives the model the current Charlotte date, weekday, and a calendar", () => {
    const context = visitClockContext(NOW);
    expect(context).toContain("2026-09-05 08:00, Saturday");
    expect(context).toContain("2026-09-05 Saturday (today)");
    expect(context).toContain("2026-09-12 Saturday");
    expect(context).toContain("2026-09-19 Saturday");
  });

  it("stores a valid preference, and re-asks instead of storing a past or incomplete one", () => {
    const ok = applyVisitPreference(base({ visitDate: "2026-09-12", visitWindow: "morning" }), NOW, "en");
    expect(ok.details).toMatchObject({ desiredTime: "2026-09-12T13:00:00.000Z", desiredTimeLabel: "Saturday, September 12, morning" });
    expect(ok.details.visitDate).toBeUndefined();
    expect(ok.readyToConfirm).toBe(true);

    const past = applyVisitPreference(base({ visitDate: "2026-09-01", visitWindow: "morning" }), NOW, "en");
    expect(past.details.desiredTime).toBeUndefined();
    expect(past.readyToConfirm).toBe(false);
    expect(past.questions).toEqual([expect.objectContaining({ id: "visit_time", requiredForSafety: false })]);
    expect(past.questions[0]?.prompt).toContain("already passed");

    const es = applyVisitPreference(base({ visitDate: "2026-09-12" }), NOW, "es");
    expect(es.questions[0]?.prompt).toContain("visita");
    expect(es.readyToConfirm).toBe(false);

    const skipped = applyVisitPreference(base({ visitDate: "2026-09-01", visitWindow: "morning" }), NOW, "en", ["visit_time"]);
    expect(skipped.questions).toEqual([]);
    expect(skipped.readyToConfirm).toBe(true);
    expect(skipped.details.desiredTime).toBeUndefined();

    const legacyPast = applyVisitPreference(base({ desiredTime: "2026-09-01T10:00:00.000Z" }), NOW, "en");
    expect(legacyPast.details.desiredTime).toBeUndefined();
    expect(legacyPast.readyToConfirm).toBe(false);
    expect(applyVisitPreference(base(), NOW, "en").details).toEqual({ location: "kitchen" });
  });
});

const actors = { customer: { id: "customer", role: "customer" as const }, provider: { id: "provider", role: "provider" as const }, operator: { id: "operator", role: "operator" as const } };
const auth: AuthAdapter = { async authenticate(token) { return actors[token as keyof typeof actors] ?? null; } };
const bearer = (token: keyof typeof actors) => ({ Authorization: `Bearer ${token}` });
const signingSecret = "test-intake-signing-secret-with-at-least-32-bytes";

class VisitProvider implements IntakeAiProvider {
  readonly inputs: AnalyzeInput[] = [];
  constructor(public next: ModelAssessment) {}
  async analyze(input: AnalyzeInput) { this.inputs.push(input); return this.next; }
  async translate(text: string) { return text; }
}

const setup = (provider: IntakeAiProvider, now = () => NOW) => {
  const repository = new InMemoryRepository();
  const app = createApp({ repository, auth, paymentsEnabled: false, intakeProvider: provider, intakeSigningSecret: signingSecret, intakeUsageBudget: new InMemoryIntakeUsageBudget(), now });
  return { app, repository };
};
const analyze = (app: ReturnType<typeof createApp>, content: string, locale: "en" | "es" = "en") => request(app).post("/api/intake/analyze").set(bearer("customer")).field("payload", JSON.stringify({ locale, history: [{ role: "user", content }] }));
const confirm = (app: ReturnType<typeof createApp>, token: string) => request(app).post("/api/intake/confirm").set(bearer("customer")).send({ assessmentToken: token, customerName: "Alex", address: "Charlotte, NC", acceptedIssueIds: ["drain_leak"], warningAcknowledged: true });

describe("chat visit time reaches the saved request", () => {
  it("passes the current date to the model and saves 'Saturday morning' as a proposed visit", async () => {
    const provider = new VisitProvider(base({ visitDate: "2026-09-12", visitWindow: "morning" }));
    const { app, repository } = setup(provider);
    const analyzed = await analyze(app, "My sink leaks. Next Saturday morning works for me.").expect(200);
    expect(provider.inputs[0]?.now?.toISOString()).toBe(NOW.toISOString());
    expect(analyzed.body.details).toMatchObject({ desiredTime: "2026-09-12T13:00:00.000Z", desiredTimeLabel: "Saturday, September 12, morning" });
    expect(analyzed.body.details.visitDate).toBeUndefined();

    const confirmed = await confirm(app, analyzed.body.assessmentToken).expect(201);
    expect(confirmed.body.visit).toMatchObject({ startsAt: "2026-09-12T13:00:00.000Z", timeZone: "America/New_York", status: "proposed", label: "Saturday, September 12, morning" });
    const dashboard = await repository.dashboard(actors.customer);
    const saved = dashboard.requests.find((item) => item.id === confirmed.body.requestId);
    expect(saved?.workScopeSnapshot).toMatchObject({ desiredTime: "2026-09-12T13:00:00.000Z", desiredTimeLabel: "Saturday, September 12, morning" });
    expect(dashboard.schedules).toEqual([expect.objectContaining({ requestId: confirmed.body.requestId, startsAt: "2026-09-12T13:00:00.000Z", status: "proposed" })]);
  });

  it("saves an exact 'Saturday 3pm' request in the requested locale", async () => {
    const provider = new VisitProvider(base({ visitDate: "2026-09-12", visitTime: "15:00" }));
    const { app } = setup(provider);
    const analyzed = await analyze(app, "Fuga bajo el fregadero, el sábado a las 3pm", "es").expect(200);
    expect(analyzed.body.details.desiredTime).toBe("2026-09-12T19:00:00.000Z");
    expect(analyzed.body.details.desiredTimeLabel).toContain("sábado");
  });

  it("asks again for a past date and never saves a schedule for it", async () => {
    const provider = new VisitProvider(base({ visitDate: "2026-09-01", visitWindow: "morning" }));
    const { app, repository } = setup(provider);
    const analyzed = await analyze(app, "Come last Tuesday morning").expect(200);
    expect(analyzed.body.readyToConfirm).toBe(false);
    expect(analyzed.body.questions).toEqual([expect.objectContaining({ id: "visit_time" })]);
    expect(analyzed.body.details.desiredTime).toBeUndefined();
    expect((await repository.dashboard(actors.customer)).schedules).toEqual([]);
  });

  it("drops a stated time that passed between analysis and confirmation instead of proposing it", async () => {
    let clock = NOW;
    const provider = new VisitProvider(base({ visitDate: "2026-09-05", visitTime: "08:20" })); // 12:20Z, 20 minutes ahead
    const { app, repository } = setup(provider, () => clock);
    const analyzed = await analyze(app, "Can you come today at 8:20am?").expect(200);
    expect(analyzed.body.details.desiredTime).toBe("2026-09-05T12:20:00.000Z");
    clock = new Date("2026-09-05T12:25:00.000Z"); // assessment token (30 min) is still valid
    const confirmed = await confirm(app, analyzed.body.assessmentToken).expect(201);
    expect(confirmed.body.visit).toBeUndefined();
    const dashboard = await repository.dashboard(actors.customer);
    expect(dashboard.schedules).toEqual([]);
    expect(dashboard.requests.find((item) => item.id === confirmed.body.requestId)?.workScopeSnapshot).not.toHaveProperty("desiredTime");
  });

  it("keeps requests without a stated time unscheduled", async () => {
    const { app, repository } = setup(new VisitProvider(base()));
    const analyzed = await analyze(app, "My sink leaks").expect(200);
    const confirmed = await confirm(app, analyzed.body.assessmentToken).expect(201);
    expect(confirmed.body.visit).toBeUndefined();
    expect((await repository.dashboard(actors.customer)).schedules).toEqual([]);
  });
});

describe("Gemini provider visit timing", () => {
  const wire = (details: Record<string, unknown>) => ({ reply: "ok", category: "plumbing", summary: "Leak under sink", issueCandidates: [], questions: [], materialsHint: [], details, safety: { level: "normal", hazards: [], guidance: "" }, readyToConfirm: true });

  it("sends the current Charlotte date and the visit-timing rules to the model", async () => {
    const provider = new GeminiIntakeProvider("test-key");
    const generate = vi.fn(async () => ({ text: JSON.stringify(wire({ visitDate: "2026-09-12", visitWindow: "morning" })), candidates: [{ finishReason: "STOP" }] }));
    (provider as unknown as { client: { models: { generateContent: typeof generate } } }).client = { models: { generateContent: generate } };
    const result = await provider.analyze({ locale: "en", history: [{ role: "user", content: "Saturday morning works" }], media: [], skippedQuestionIds: [], now: NOW } as AnalyzeInput);
    const call = generate.mock.calls[0] as unknown as [{ contents: Array<{ parts: Array<{ text: string }> }>; config: { systemInstruction: string } }];
    expect(call[0].contents[0]?.parts[0]?.text).toContain("2026-09-05 08:00, Saturday");
    expect(call[0].config.systemInstruction).toContain("Visit timing");
    expect(result.details).toMatchObject({ visitDate: "2026-09-12", visitWindow: "morning" });
  });

  it("keeps well-formed visit fields, drops malformed ones, and normalizes legacy offset timestamps to UTC", () => {
    const good = normalizeModelAssessment(wire({ visitDate: "2026-09-12", visitTime: "15:00", desiredTime: "2026-09-12T11:00:00-04:00" }));
    expect(good.details).toMatchObject({ visitDate: "2026-09-12", visitTime: "15:00", desiredTime: "2026-09-12T15:00:00.000Z" });
    const bad = normalizeModelAssessment(wire({ visitDate: "next saturday", visitTime: "3pm", visitWindow: "noonish", desiredTime: "sometime" }));
    expect(bad.details).not.toHaveProperty("visitDate");
    expect(bad.details).not.toHaveProperty("visitTime");
    expect(bad.details).not.toHaveProperty("visitWindow");
    expect(bad.details).not.toHaveProperty("desiredTime");
  });
});
