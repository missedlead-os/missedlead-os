/**
 * 일정 API 검증 테스트: 과거/먼 미래/잘못된 시간대 거부, 고객 단독 확정 금지, 입력 형식 검증.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, InMemoryRepository, type AuthAdapter } from "./app.js";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const actors = { customer: { id: "customer", role: "customer" as const }, provider: { id: "provider", role: "provider" as const }, operator: { id: "operator", role: "operator" as const } };
const auth: AuthAdapter = { async authenticate(token) { return actors[token as keyof typeof actors] ?? null; } };
const bearer = (token: keyof typeof actors) => ({ Authorization: `Bearer ${token}` });
const setup = () => {
  const repository = new InMemoryRepository();
  const app = createApp({ repository, auth, paymentsEnabled: false, now: () => NOW });
  return { app, repository };
};

describe("schedule API validation", () => {
  const prepared = async () => {
    const { app, repository } = setup();
    repository.inspect((state) => { state.providerEligibility.provider = { status: "approved", organizationName: "Mint", licenseVerified: true, licenseExpiresAt: "2027-01-01T00:00:00Z", insuranceVerified: true, insuranceExpiresAt: "2027-01-01T00:00:00Z", serviceCategories: ["general"], serviceAreas: ["Charlotte"] }; });
    const created = await request(app).post("/api/requests").set(bearer("customer")).send({ customerName: "Alex", description: "Kitchen sink leak needs repair", address: "Charlotte", hazards: ["none"] }).expect(201);
    const requestId = String(created.body.id);
    await request(app).post(`/api/requests/${requestId}/match`).set(bearer("operator")).send({ providerIds: ["provider"] }).expect(200);
    return { app, requestId, put: (token: keyof typeof actors, body: object) => request(app).put(`/api/requests/${requestId}/schedule`).set(bearer(token)).send(body) };
  };
  const future = "2026-09-08T14:00:00.000Z";

  it("rejects past times, unknown time zones, and far-future times with stable error codes", async () => {
    const { put } = await prepared();
    expect((await put("customer", { startsAt: "2026-09-05T11:59:59.000Z", timeZone: "America/New_York", status: "proposed" }).expect(422)).body).toEqual({ error: "schedule_in_past" });
    expect((await put("customer", { startsAt: "2025-01-01T10:00:00.000Z", timeZone: "America/New_York", status: "proposed" }).expect(422)).body).toEqual({ error: "schedule_in_past" });
    expect((await put("customer", { startsAt: future, timeZone: "Mars/Olympus", status: "proposed" }).expect(422)).body).toEqual({ error: "schedule_time_zone_invalid" });
    expect((await put("customer", { startsAt: "2028-01-01T10:00:00.000Z", timeZone: "America/New_York", status: "proposed" }).expect(422)).body).toEqual({ error: "schedule_too_far" });
  });

  it.each([
    ["03:00", false], ["06:59", false], ["07:00", true], ["18:30", true],
    ["20:00", true], ["20:30", false],
  ])("checks customer local start %s across DST", async (time, allowed) => {
    const { put } = await prepared();
    for (const [day, offset] of [["2026-09-12", "-04:00"], ["2026-12-12", "-05:00"]]) {
      const response = await put("customer", { startsAt: `${day}T${time}:00${offset}`, timeZone: "America/New_York", status: "proposed" }).expect(allowed ? 200 : 422);
      if (!allowed) expect(response.body).toEqual({ error: "schedule_outside_hours" });
    }
  });

  it("evaluates the request time zone, independently of the timestamp offset", async () => {
    const { put } = await prepared();
    const startsAt = "2026-12-12T12:00:00Z";
    await put("customer", { startsAt, timeZone: "America/New_York", status: "proposed" }).expect(200);
    expect((await put("customer", { startsAt, timeZone: "America/Los_Angeles", status: "proposed" }).expect(422)).body).toEqual({ error: "schedule_outside_hours" });
  });

  it("allows providers and operators to propose or confirm special hours", async () => {
    const { put } = await prepared();
    for (const actor of ["provider", "operator"] as const) {
      for (const status of ["proposed", "confirmed"]) {
        await put(actor, { startsAt: "2026-09-12T06:00:00-04:00", timeZone: "America/New_York", status }).expect(200);
      }
    }
  });

  it("rejects malformed input before touching the repository", async () => {
    const { put } = await prepared();
    await put("customer", {}).expect(400);
    await put("customer", { startsAt: "next saturday", timeZone: "America/New_York", status: "proposed" }).expect(400);
    await put("customer", { startsAt: future, timeZone: "", status: "proposed" }).expect(400);
    await put("customer", { startsAt: future, timeZone: "America/New_York", status: "done" }).expect(400);
    await put("customer", { startsAt: future, timeZone: "x".repeat(65), status: "proposed" }).expect(400);
  });

  it("lets a customer propose but never self-confirm; the matched provider or an operator confirms", async () => {
    const { put, app, requestId } = await prepared();
    await put("customer", { startsAt: future, timeZone: "America/New_York", status: "proposed" }).expect(200);
    expect((await put("customer", { startsAt: future, timeZone: "America/New_York", status: "confirmed" }).expect(403)).body).toEqual({ error: "schedule_confirmation_forbidden" });
    await put("provider", { startsAt: future, timeZone: "America/New_York", status: "confirmed" }).expect(200);
    await put("operator", { startsAt: "2026-09-09T14:00:00.000Z", timeZone: "America/New_York", status: "confirmed" }).expect(200);
    await put("provider", { startsAt: "2026-09-01T14:00:00.000Z", timeZone: "America/New_York", status: "confirmed" }).expect(422);
    const stored = (await request(app).get("/api/dashboard").set(bearer("operator")).expect(200)).body.schedules.find((item: { requestId: string }) => item.requestId === requestId);
    expect(stored).toMatchObject({ startsAt: "2026-09-09T14:00:00.000Z", status: "confirmed" });
  });

  it("normalizes offset timestamps to UTC and still checks access", async () => {
    const { put, app } = await prepared();
    await put("customer", { startsAt: "2026-09-08T10:00:00-04:00", timeZone: "America/New_York", status: "proposed" }).expect(200);
    await request(app).put("/api/requests/unknown-request/schedule").set(bearer("customer")).send({ startsAt: future, timeZone: "America/New_York", status: "proposed" }).expect(403);
  });
});

