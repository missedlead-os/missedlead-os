/**
 * 방문 일정 입력 검증(서버 우선). 과거 시각, 잘못된 time zone, 고객 단독 확정을 막는다.
 * 확정(confirmed)은 업체/운영자 흐름에서만 허용한다. DB 함수(0016_schedule_validation.sql)는 같은 규칙의 이중 방어선이다.
 */
import { z } from "zod";
import type { Actor } from "./repository.js";
import { isValidTimeZone, isWithinCustomerVisitHours } from "./intake/visitTime.js";

export const MAX_SCHEDULE_LEAD_DAYS = 365;

export const scheduleBodySchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(64),
  status: z.enum(["proposed", "confirmed"]),
});
export type ScheduleInput = { readonly startsAt: string; readonly timeZone: string; readonly status: "proposed" | "confirmed" };

export type ScheduleCheck =
  | { readonly ok: true; readonly input: ScheduleInput }
  | { readonly ok: false; readonly status: 403 | 422; readonly error: "schedule_confirmation_forbidden" | "schedule_in_past" | "schedule_too_far" | "schedule_time_zone_invalid" | "schedule_outside_hours" };

export const checkSchedule = (value: ScheduleInput, who: Actor, now: Date): ScheduleCheck => {
  if (!isValidTimeZone(value.timeZone)) return { ok: false, status: 422, error: "schedule_time_zone_invalid" };
  const startsAt = new Date(value.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, status: 422, error: "schedule_in_past" };
  if (startsAt.getTime() <= now.getTime()) return { ok: false, status: 422, error: "schedule_in_past" };
  if (startsAt.getTime() > now.getTime() + MAX_SCHEDULE_LEAD_DAYS * 86_400_000) return { ok: false, status: 422, error: "schedule_too_far" };
  if (value.status === "confirmed" && who.role === "customer") return { ok: false, status: 403, error: "schedule_confirmation_forbidden" };
  if (who.role === "customer" && value.status === "proposed" && !isWithinCustomerVisitHours(startsAt, value.timeZone)) return { ok: false, status: 422, error: "schedule_outside_hours" };
  return { ok: true, input: { startsAt: startsAt.toISOString(), timeZone: value.timeZone, status: value.status } };
};
