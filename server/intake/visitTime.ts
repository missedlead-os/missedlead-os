/**
 * 채팅에서 고객이 말한 방문 희망 시간을 구조화한다.
 * 모델은 날짜(YYYY-MM-DD)·시각(HH:MM)·시간대(morning/afternoon/evening)만 내고,
 * 샤를럿(America/New_York) 현지 시각 → UTC 변환과 과거·범위 검증은 서버가 결정적으로 수행한다.
 */
import type { IntakeLocale, ModelAssessment } from "./types.js";

export const VISIT_TIME_ZONE = "America/New_York";
export const MAX_VISIT_LEAD_DAYS = 180;
const WINDOW_START_HOUR = { morning: 9, afternoon: 13, evening: 17 } as const;
export type VisitWindow = keyof typeof WINDOW_START_HOUR;

const localeTag = (locale: IntakeLocale) => (locale === "es" ? "es-US" : "en-US");

const zoneParts = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
};

/** 해당 시각 UTC가 time zone에서 몇 분 앞서는지(분). */
const offsetMinutes = (instant: Date, timeZone: string): number => {
  const local = zoneParts(instant, timeZone);
  return (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
};

/** 현지 달력 시각 → UTC Date. 존재하지 않는 현지 시각(달력상 31일 초과 등)은 undefined. */
export const zonedToUtc = (year: number, month: number, day: number, hour: number, minute: number, timeZone = VISIT_TIME_ZONE): Date | undefined => {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const result = new Date(guess);
  const back = zoneParts(result, timeZone);
  return back.hour === hour && back.minute === minute && back.day === day ? result : undefined;
};

export const isValidTimeZone = (value: string): boolean => {
  if (!value || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
};

/** 모델 프롬프트용 현재 시각·요일 컨텍스트(향후 14일 달력 포함). */
export const visitClockContext = (now: Date, timeZone = VISIT_TIME_ZONE): string => {
  const local = zoneParts(now, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  const weekday = (instant: Date, zone = timeZone) => new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(instant);
  const base = Date.UTC(local.year, local.month - 1, local.day);
  const days = Array.from({ length: 15 }, (_, index) => {
    const day = new Date(base + index * 86_400_000);
    return `${day.toISOString().slice(0, 10)} ${weekday(day, "UTC")}${index === 0 ? " (today)" : ""}`;
  });
  return `Current date and time in Charlotte (${timeZone}): ${local.year}-${pad(local.month)}-${pad(local.day)} ${pad(local.hour)}:${pad(local.minute)}, ${weekday(now)}. Calendar for the next 15 days: ${days.join("; ")}.`;
};

export type VisitPreference = { readonly visitDate?: string | null; readonly visitTime?: string | null; readonly visitWindow?: VisitWindow | null };
export type VisitResolution =
  | { readonly status: "none" }
  | { readonly status: "ok"; readonly desiredTime: string; readonly label: string }
  | { readonly status: "past" | "too_far" | "invalid" };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const formatVisitLabel = (instant: Date, locale: IntakeLocale, window?: VisitWindow | null, exactTime = false, timeZone = VISIT_TIME_ZONE): string => {
  const day = new Intl.DateTimeFormat(localeTag(locale), { timeZone, weekday: "long", month: "long", day: "numeric" }).format(instant);
  if (exactTime || !window) return `${day}, ${new Intl.DateTimeFormat(localeTag(locale), { timeZone, hour: "numeric", minute: "2-digit" }).format(instant)}`;
  const names = { en: { morning: "morning", afternoon: "afternoon", evening: "evening" }, es: { morning: "por la mañana", afternoon: "por la tarde", evening: "por la noche" } } as const;
  return `${day}, ${names[locale][window]}`;
};

export const resolveVisitPreference = (preference: VisitPreference, now: Date, locale: IntakeLocale): VisitResolution => {
  const date = preference.visitDate ?? undefined;
  const time = preference.visitTime ?? undefined;
  const window = preference.visitWindow ?? undefined;
  if (!date && !time && !window) return { status: "none" };
  const dateMatch = date ? DATE_PATTERN.exec(date) : null;
  if (!dateMatch) return { status: "invalid" };
  const timeMatch = time ? TIME_PATTERN.exec(time) : null;
  if (time && !timeMatch) return { status: "invalid" };
  if (!timeMatch && !window) return { status: "invalid" }; // 날짜만으로는 방문 시간이 아님 → 재질문
  const hour = timeMatch ? Number(timeMatch[1]) : WINDOW_START_HOUR[window as VisitWindow];
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const instant = zonedToUtc(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]), hour, minute);
  if (!instant) return { status: "invalid" };
  if (instant.getTime() <= now.getTime()) return { status: "past" };
  if (instant.getTime() > now.getTime() + MAX_VISIT_LEAD_DAYS * 86_400_000) return { status: "too_far" };
  return { status: "ok", desiredTime: instant.toISOString(), label: formatVisitLabel(instant, locale, timeMatch ? undefined : window, Boolean(timeMatch)) };
};

const VISIT_QUESTION_ID = "visit_time";
const revisitPrompt = (locale: IntakeLocale, reason: "past" | "too_far" | "invalid"): string => {
  if (locale === "es") return reason === "past" ? "Ese horario ya pasó. ¿Qué día y a qué hora (mañana, tarde o una hora exacta) le gustaría la visita?" : "¿Qué día y a qué hora (mañana, tarde o una hora exacta) le gustaría la visita? Podemos programar hasta 6 meses adelante.";
  return reason === "past" ? "That time has already passed. What day and time (morning, afternoon, or an exact time) would you like the visit?" : "What day and time (morning, afternoon, or an exact time) would you like the visit? We can schedule up to 6 months ahead.";
};

type Details = ModelAssessment["details"];
const withoutVisitFields = (details: Details): Details => {
  const { visitDate: _date, visitTime: _time, visitWindow: _window, desiredTime: _desired, desiredTimeLabel: _label, ...rest } = details;
  return rest;
};

/**
 * 모델이 낸 방문 희망 필드를 서버에서 확정한다.
 * - 유효: details.desiredTime(UTC ISO)·desiredTimeLabel 저장
 * - 과거/범위 밖/형식 오류: 값을 버리고 비-안전 재질문(visit_time)을 추가해 readyToConfirm을 막는다(이미 건너뛴 경우 제외).
 */
export const applyVisitPreference = (assessment: ModelAssessment, now: Date, locale: IntakeLocale, skippedQuestionIds: readonly string[] = []): ModelAssessment => {
  const details = assessment.details;
  const preference: VisitPreference = { visitDate: details.visitDate, visitTime: details.visitTime, visitWindow: details.visitWindow };
  let resolution = resolveVisitPreference(preference, now, locale);
  if (resolution.status === "none" && details.desiredTime) {
    const legacy = new Date(details.desiredTime);
    if (Number.isNaN(legacy.getTime())) resolution = { status: "invalid" };
    else if (legacy.getTime() <= now.getTime()) resolution = { status: "past" };
    else if (legacy.getTime() > now.getTime() + MAX_VISIT_LEAD_DAYS * 86_400_000) resolution = { status: "too_far" };
    else resolution = { status: "ok", desiredTime: legacy.toISOString(), label: formatVisitLabel(legacy, locale, undefined, true) };
  }
  if (resolution.status === "none") return { ...assessment, details: withoutVisitFields(details) };
  if (resolution.status === "ok") return { ...assessment, details: { ...withoutVisitFields(details), desiredTime: resolution.desiredTime, desiredTimeLabel: resolution.label } };
  const skipped = skippedQuestionIds.includes(VISIT_QUESTION_ID);
  const asked = assessment.questions.some((question) => question.id === VISIT_QUESTION_ID);
  const questions = asked || skipped ? assessment.questions : [...assessment.questions, { id: VISIT_QUESTION_ID, prompt: revisitPrompt(locale, resolution.status), requiredForSafety: false }];
  return { ...assessment, details: withoutVisitFields(details), questions, readyToConfirm: skipped ? assessment.readyToConfirm : false };
};
