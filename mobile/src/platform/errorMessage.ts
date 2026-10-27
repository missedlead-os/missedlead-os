/**
 * API 오류 타입과 EN/ES 오류 메시지 매핑(순수 모듈: 네트워크/Expo 의존 없음, 테스트 가능).
 */

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = 'ApiError'; }
}

export function errorMessage(error: unknown, locale: 'en' | 'es'): string {
  const t = (en: string, es: string) => locale === 'es' ? es : en;
  if (!(error instanceof ApiError)) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return t('The connection took too long. Please retry.', 'La conexión tardó demasiado. Inténtalo de nuevo.');
    if (error instanceof TypeError) return t('Check your connection and try again.', 'Comprueba tu conexión e inténtalo de nuevo.');
    return t('Something went wrong. Please refresh and try again.', 'Algo salió mal. Actualiza e inténtalo de nuevo.');
  }
  const code = error.code.toLowerCase();
  if (error.status === 401) return t('Your session has expired. Please sign in again.', 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
  if (code.includes('schedule_in_past')) return t('That visit time has already passed. Pick a future date and time.', 'Esa hora de visita ya pasó. Elige una fecha y hora futuras.');
  if (code.includes('schedule_too_far')) return t('That visit time is too far ahead. Pick a date within the next year.', 'Esa hora de visita es demasiado lejana. Elige una fecha dentro del próximo año.');
  if (code.includes('schedule_time_zone_invalid')) return t('We could not read the time zone for this visit. Please try again.', 'No pudimos leer la zona horaria de esta visita. Inténtalo de nuevo.');
  if (code.includes('schedule_confirmation_forbidden')) return t('The professional confirms the visit. Your time stays proposed until then.', 'El profesional confirma la visita. Tu horario sigue como propuesta hasta entonces.');
  if (code.includes('payments_disabled') || code.includes('payment_disabled')) return t('Payments are not available yet.', 'Los pagos aún no están disponibles.');
  if (code.includes('quote') && (code.includes('expired') || code.includes('stale'))) return t('This quote has expired. Ask the professional for an updated quote.', 'Este presupuesto ha caducado. Pide uno actualizado al profesional.');
  if (code.includes('permit')) return t('The required permit must be recorded before this work can continue.', 'Es necesario registrar el permiso requerido antes de continuar.');
  if (code.includes('coverage') && (code.includes('config') || code.includes('unavailable'))) return t('Service coverage is not available right now. Please try later.', 'La cobertura del servicio no está disponible ahora. Inténtalo más tarde.');
  if (code.includes('zip') || code.includes('outside_service_area') || code.includes('coverage_not_supported')) return t('Check the ZIP code. This address may be outside our service area.', 'Comprueba el código postal. La dirección podría estar fuera de nuestra zona de servicio.');
  if (code.includes('dispute_window_closed')) return t('The 72-hour reporting window has ended.', 'El plazo de 72 horas para informar ha terminado.');
  if (code.includes('settled_job_required')) return t('You can leave a review after the job payment is complete.', 'Puedes dejar una reseña cuando se complete el pago del trabajo.');
  if (code.includes('review_exists')) return t('A review has already been saved for this job.', 'Ya se ha guardado una reseña para este trabajo.');
  if (error.status === 403) return t('You do not have access to this action. Check your account and request status.', 'No tienes acceso a esta acción. Comprueba tu cuenta y el estado de la solicitud.');
  if (error.status === 404) return t('This item is no longer available. Please refresh.', 'Este elemento ya no está disponible. Actualiza.');
  if (error.status === 400 || error.status === 422) return t('Check the information you entered and try again.', 'Comprueba la información introducida e inténtalo de nuevo.');
  if (error.status === 409) return t('The request has changed or is not ready for this action. Refresh to see its current status.', 'La solicitud ha cambiado o aún no permite esta acción. Actualiza para ver su estado.');
  if (error.status === 413) return t('The file is too large. Choose a smaller file.', 'El archivo es demasiado grande. Elige uno más pequeño.');
  if (error.status === 429) return t('Too many requests. Please wait a moment and retry.', 'Hay demasiadas solicitudes. Espera un momento e inténtalo de nuevo.');
  if (error.status >= 500) return t('The service is temporarily unavailable. Please try later.', 'El servicio no está disponible temporalmente. Inténtalo más tarde.');
  return t('We could not complete this action. Refresh and try again.', 'No pudimos completar esta acción. Actualiza e inténtalo de nuevo.');
}
