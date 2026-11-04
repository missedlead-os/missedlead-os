import { describe, expect, it } from 'vitest';
import { hasCancelIntent, hasIntakeAbandonIntent } from './cancelIntent.js';
describe('deterministic cancellation intent', () => {
  it.each(['예약 취소할게요', '취소할께요', 'cancel my appointment', 'cancel appt', 'cancelar la cita', 'cancelar mi cita', "I don't need it anymore, please cancel", 'never mind, cancel'])('recognizes %s', text => expect(hasCancelIntent(text)).toBe(true));
  it.each(["don't cancel", 'do not cancel my appointment', 'no cancele', 'no, mejor no la cancele', '취소 안 할게요', '취소하지 마세요', '안 취소할게요', 'cancel culture is crazy lol, anyway the leak is worse', 'cancellation policy?', '저기요', '그 예약', 'the customer asked to cancel?'])('rejects %s', text => expect(hasCancelIntent(text)).toBe(false));
  it.each(["never mind, don't cancel", 'never mind the paint, my sink leaks', 'no cancele mi cita', '취소 안 할게요'])('rejects negated or unrelated abandonment %s', text => expect(hasIntakeAbandonIntent(text)).toBe(false));
  it.each(['never mind', "never mind, cancel, I'll fix it myself", 'ya no lo necesito', '그만 할게요'])('recognizes intake abandonment %s', text => expect(hasIntakeAbandonIntent(text)).toBe(true));
});
