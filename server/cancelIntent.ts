const negatedCancellation = /\b(?:don'?t|do not|never|cannot|can'?t)\s+(?:\w+\s+){0,3}cancel\b|\b(?:no|nunca)\b.{0,35}\bcancel(?:ar|e|es|en)?\b|취소\s*(?:안|하지\s*(?:마|않)|하지는\s*마)|안\s*취소/;

/** Conservative chat intent only; cancellation always requires a separate confirmation. */
export function hasCancelIntent(input: string): boolean {
  const text = input.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  // Negation wins over a positive mention anywhere in the same message.
  if (negatedCancellation.test(text)) return false;
  if (/\bcancel\s+culture\b/.test(text)) return false;
  return /취소\s*(?:할[게께]요|하겠|해\s*주세요|해줘|부탁)|\b(?:cancel|cancelar|cancele)\s+(?:(?:my|the|this|mi|la|el|esta|por favor)\s+){0,3}(?:appointment|appt|booking|request|visit|cita|reserva|solicitud)\b|\b(?:please\s+cancel|cancel\s+please)\b|^(?:never\s*mind[,! ]*)?cancel[.! ,]*$/.test(text);
}

export function hasIntakeAbandonIntent(input: string): boolean {
  if (hasCancelIntent(input)) return true;
  const text = input.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");
  return !negatedCancellation.test(text) && /^(?:never\s*mind|forget (?:it|about it))(?:[.!\s]*|[,;! .]+(?:cancel\b.*|i(?:'ll| will) (?:fix|handle|do) it myself[.! ]*))$|^ya no (?:lo )?necesito[.! ]*$|^d[eé]jalo[.! ]*$|그만\s*할[게께]요/.test(text.trim()) && !/\b(?:don't|do not)\s+(?:say\s+)?(?:never\s*mind|forget)\b/.test(text);
}
