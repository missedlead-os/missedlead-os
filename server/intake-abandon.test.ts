import { describe, expect, it, vi } from 'vitest';
import { createApp, InMemoryRepository } from './app.js';
import { localFetch } from './testing/local-http.js';
import { modelAssessmentSchema } from './intake/types.js';

describe('intake abandonment before AI (no sockets)', () => {
  it.each(['en', 'es'] as const)('returns a non-confirmable %s reply and creates nothing', async locale => {
    const analyze = vi.fn();
    const app = createApp({ repository:new InMemoryRepository(), paymentsMode:'disabled', auth:{async authenticate(){return {role:'customer',id:'owner'};}}, intakeProvider:{analyze, async translate(text){return text;}}, intakeSigningSecret:'test-intake-signing-secret-with-at-least-32-bytes' });
    const form = new FormData();
    form.set('payload',JSON.stringify({locale,history:[{role:'user',content:'my sink leaks'},{role:'assistant',content:'Tell me more'},{role:'user',content:locale === 'es' ? 'cancelar mi cita' : "never mind, cancel, I'll fix it myself"}],mediaConsent:false,translations:[]}));
    const response = await localFetch(app,'http://local/api/intake/analyze',{method:'POST',headers:{Authorization:'Bearer owner'},body:form});
    expect(response.status).toBe(200);
    const result = await response.json();
    // Check the client-facing assessment fields without loading the Expo project.
    expect(modelAssessmentSchema.safeParse(result).success).toBe(true);
    expect(result.locale).toBe(locale);
    expect(result.assessmentToken).toEqual(expect.any(String));
    expect(result.assessmentToken.length).toBeGreaterThan(0);
    expect(result.references).toEqual([]);
    expect(result).toMatchObject({readyToConfirm:false,issueCandidates:[],questions:[]});
    expect(result.reply).toContain(locale === 'es' ? 'No se ha reservado nada' : 'Nothing was booked');
    expect(analyze).not.toHaveBeenCalled();
    const confirm = await localFetch(app,'http://local/api/intake/confirm',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({assessmentToken:result.assessmentToken,customerName:'Owner',address:'100 N Tryon St, Charlotte, NC 28202',acceptedIssueIds:['x'],warningAcknowledged:true})});
    expect(confirm.status).toBe(409);
    const dashboard = await localFetch(app,'http://local/api/dashboard',{headers:{Authorization:'Bearer owner'}});
    expect((await dashboard.json()).requests).toEqual([]);
  });
});
