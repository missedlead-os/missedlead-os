/**
 * API 에러 코드(snake_case)를 고객에게 보여줄 en/es 문구로 바꾼다. 모르는 코드는 일반 문구로 숨긴다.
 */
export type ErrorLocale = "en" | "es";

const MESSAGES: Record<string, { en: string; es: string }> = {
  schedule_outside_hours: { en: "Visits can be booked between 7 AM and 8 PM. Please choose a time within those hours.", es: "Las visitas se pueden reservar entre las 7 AM y las 8 PM. Elija un horario dentro de esas horas." },
  schedule_in_past: { en: "That visit time has already passed. Please pick a future date and time.", es: "Esa hora de visita ya pasó. Elija una fecha y hora futuras." },
  schedule_too_far: { en: "That visit time is too far ahead. Please pick a date within the next year.", es: "Esa hora de visita es demasiado lejana. Elija una fecha dentro del próximo año." },
  schedule_time_zone_invalid: { en: "We couldn’t read the time zone for that visit. Please try again.", es: "No pudimos leer la zona horaria de esa visita. Inténtelo de nuevo." },
  schedule_confirmation_forbidden: { en: "Your pro confirms the visit. We’ve saved your time as a proposal.", es: "Su técnico confirma la visita. Guardamos su horario como propuesta." },
  schedule_forbidden: { en: "You can’t change this visit time.", es: "No puede cambiar la hora de esta visita." },
  service_zip_unavailable: { en: "We don’t serve that ZIP code yet. WeCover is currently available in the Charlotte area.", es: "Todavía no damos servicio en ese código postal. WeCover está disponible por ahora en el área de Charlotte." },
  forbidden: { en: "You don’t have access to do that.", es: "No tiene acceso para hacer eso." },
  authentication_required: { en: "Please sign in again to continue.", es: "Inicie sesión de nuevo para continuar." },
  invalid_token: { en: "Please sign in again to continue.", es: "Inicie sesión de nuevo para continuar." },
  invalid_request: { en: "Some details look incorrect. Please check them and try again.", es: "Algunos datos parecen incorrectos. Revíselos e inténtelo de nuevo." },
  request_not_found: { en: "We couldn’t find that request.", es: "No encontramos esa solicitud." },
  invalid_assessment_token: { en: "This consultation expired. Please send your message again.", es: "Esta consulta venció. Envíe su mensaje de nuevo." },
  intake_ai_unavailable: { en: "The repair assistant is temporarily unavailable. Please try again.", es: "El asistente no está disponible en este momento. Inténtelo de nuevo." },
  intake_request_in_progress: { en: "Still analyzing your previous message — please try again in a moment.", es: "Todavía estamos analizando su mensaje anterior — inténtelo de nuevo en un momento." },
  intake_daily_quota_exceeded: { en: "You’ve reached today’s message limit. Please try again tomorrow.", es: "Alcanzó el límite de mensajes de hoy. Inténtelo de nuevo mañana." },
  payments_not_enabled: { en: "Online payments aren’t live yet.", es: "Los pagos en línea todavía no están disponibles." },
  safety_clearance_required: { en: "Please finish the safety check first.", es: "Primero complete la revisión de seguridad." },
  privacy_consent_required: { en: "Please accept the privacy notice to continue.", es: "Acepte el aviso de privacidad para continuar." },
};

const GENERIC: Record<ErrorLocale, string> = {
  en: "Something went wrong. Please try again.",
  es: "Algo salió mal. Inténtelo de nuevo.",
};

const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

let currentLocale: ErrorLocale = "en";
export const setErrorLocale = (locale: ErrorLocale) => { currentLocale = locale; };

/** True when the text looks like a raw machine code (snake_case, no spaces). */
export const isRawErrorCode = (text: string) => CODE_PATTERN.test(text);

/** Returns readable copy for a known code; unknown snake_case codes become a generic message; real sentences pass through. */
export function friendlyError(codeOrMessage: string | undefined, locale: ErrorLocale = currentLocale, fallback?: string): string {
  const text = codeOrMessage?.trim();
  if (!text) return fallback ?? GENERIC[locale];
  const known = MESSAGES[text];
  if (known) return known[locale];
  if (isRawErrorCode(text)) return fallback ?? GENERIC[locale];
  return text;
}
