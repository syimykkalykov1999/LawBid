import {
  agreementOf,
  auditSamplePct,
  decideAutomatically,
  faceBand,
  inAutoAuditSample,
  type AutoDecisionInput,
} from './auto-decision.logic';

/** Everything matched (row 60): the base every case changes one fact of. */
const allPass = (over: Partial<AutoDecisionInput> = {}): AutoDecisionInput => ({
  enabled: true,
  staffAccount: false,
  status: 'submitted',
  consent: true,
  licenses: [{ stateCode: 'NY', formatUnusual: false, registry: 'pass' }],
  identity: { hasIdFront: true, missingBack: false, hasSelfie: true },
  face: { result: 'pass', similarity: 98, reason: null },
  faceRejectBelow: 50,
  liveness: true,
  ai: { decision: 'approve', lane: 'bulk' },
  persona: { required: false, passed: false },
  requestInfoEnabled: false,
  ...over,
});

describe('decideAutomatically (row 60)', () => {
  it('all pass → approve', () => {
    expect(decideAutomatically(allPass())).toEqual({
      proposal: 'approve',
      reason: null,
    });
    // An AI proposal in the audit lane is confident too.
    expect(
      decideAutomatically(
        allPass({ ai: { decision: 'approve', lane: 'audit' } }),
      )?.proposal,
    ).toBe('approve');
  });

  it('switch off → nothing automatic (null: no row, no change)', () => {
    expect(decideAutomatically(allPass({ enabled: false }))).toBeNull();
    // Even a clear failure is left to a person.
    expect(
      decideAutomatically(
        allPass({
          enabled: false,
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'not_found' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('never for an owner or staff account, never once a person took it', () => {
    expect(decideAutomatically(allPass({ staffAccount: true }))).toBeNull();
    expect(decideAutomatically(allPass({ status: 'in_review' }))).toBeNull();
    expect(
      decideAutomatically(allPass({ status: 'needs_more_info' })),
    ).toBeNull();
  });

  it('no automatic decision without the biometric consent (not even a reject)', () => {
    expect(decideAutomatically(allPass({ consent: false }))).toEqual({
      proposal: 'queue',
      reason: 'no_biometric_consent',
    });
    expect(
      decideAutomatically(
        allPass({
          consent: false,
          face: { result: 'fail', similarity: 10, reason: 'selfie_mismatch' },
        }),
      )?.proposal,
    ).toBe('queue');
  });

  // Owner 13.11 (row 60): uncertain checks go to a person, never a reject.
  it('registry not found → human queue (a scraper miss looks the same)', () => {
    expect(
      decideAutomatically(
        allPass({
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'not_found' },
          ],
          ai: null,
        }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'registry_not_found' });
  });

  it('registry error / timeout → human queue, not the «upload again» lever', () => {
    expect(
      decideAutomatically(
        allPass({
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'unavailable' },
          ],
          identity: { hasIdFront: true, missingBack: true, hasSelfie: true },
          requestInfoEnabled: true,
        }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'registry_unavailable' });
  });

  it('inactive without discipline (retired, inactive) → human queue', () => {
    expect(
      decideAutomatically(
        allPass({
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'pass' },
            { stateCode: 'CA', formatUnusual: false, registry: 'not_active' },
          ],
        }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'registry_not_active' });
  });

  it('face 30 % (below the line) → human queue, marked far apart', () => {
    expect(
      decideAutomatically(
        allPass({
          face: { result: 'fail', similarity: 30, reason: 'selfie_mismatch' },
        }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'face_far_apart' });
  });

  it('registry record disbarred / suspended / revoked → the only reject', () => {
    expect(
      decideAutomatically(
        allPass({
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'pass' },
            { stateCode: 'CA', formatUnusual: false, registry: 'disciplined' },
          ],
        }),
      ),
    ).toEqual({ proposal: 'reject', reason: 'license_inactive' });
    // Before the uncertain ones: a disbarred licence rejects even with a
    // second licence not found.
    expect(
      decideAutomatically(
        allPass({
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'not_found' },
            { stateCode: 'CA', formatUnusual: false, registry: 'disciplined' },
          ],
        }),
      )?.proposal,
    ).toBe('reject');
  });

  it('a face between the reject line and the threshold waits for a person', () => {
    expect(
      decideAutomatically(
        allPass({
          face: { result: 'fail', similarity: 72, reason: 'selfie_mismatch' },
        }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'face_fail' });
    // Not measured (old rows) is never a reject.
    expect(
      decideAutomatically(
        allPass({
          face: { result: 'fail', similarity: null, reason: 'selfie_mismatch' },
        }),
      )?.proposal,
    ).toBe('queue');
  });

  it('anything missing → queue', () => {
    const q = (over: Partial<AutoDecisionInput>) =>
      decideAutomatically(allPass(over));
    expect(q({ licenses: [] })).toEqual({
      proposal: 'queue',
      reason: 'no_license',
    });
    expect(
      q({
        licenses: [{ stateCode: 'WY', formatUnusual: false, registry: 'none' }],
      }),
    ).toEqual({ proposal: 'queue', reason: 'registry_none' });
    expect(
      q({
        licenses: [
          { stateCode: 'NY', formatUnusual: false, registry: 'name_mismatch' },
        ],
      }),
    ).toEqual({ proposal: 'queue', reason: 'registry_name_mismatch' });
    expect(
      q({
        licenses: [
          { stateCode: 'NY', formatUnusual: false, registry: 'unavailable' },
        ],
      }),
    ).toEqual({ proposal: 'queue', reason: 'registry_unavailable' });
    expect(
      q({
        licenses: [{ stateCode: 'NY', formatUnusual: true, registry: 'pass' }],
      }),
    ).toEqual({ proposal: 'queue', reason: 'format_unusual' });
    expect(
      q({ face: { result: 'none', similarity: null, reason: null } }),
    ).toEqual({
      proposal: 'queue',
      reason: 'face_none',
    });
    expect(
      q({
        face: {
          result: 'manual_review',
          similarity: null,
          reason: 'low_quality',
        },
      }),
    ).toEqual({ proposal: 'queue', reason: 'face_manual_review' });
    expect(q({ liveness: false })).toEqual({
      proposal: 'queue',
      reason: 'liveness_not_passed',
    });
    expect(q({ ai: null })).toEqual({
      proposal: 'queue',
      reason: 'ai_not_reviewed',
    });
    expect(q({ ai: { decision: 'approve', lane: 'priority' } })).toEqual({
      proposal: 'queue',
      reason: 'ai_approve',
    });
    expect(
      q({ identity: { hasIdFront: true, missingBack: true, hasSelfie: true } }),
    ).toEqual({ proposal: 'queue', reason: 'id_back_missing' });
    expect(
      q({
        identity: { hasIdFront: false, missingBack: false, hasSelfie: true },
      }),
    ).toEqual({ proposal: 'queue', reason: 'identity_missing' });
  });

  it('the AI never rejects on its own', () => {
    expect(
      decideAutomatically(
        allPass({ ai: { decision: 'reject', lane: 'bulk' } }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'ai_reject' });
  });

  it('Persona lever: off by default; on = an approval needs its pass', () => {
    expect(
      decideAutomatically(
        allPass({ persona: { required: true, passed: false } }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'persona_not_passed' });
    expect(
      decideAutomatically(
        allPass({ persona: { required: true, passed: true } }),
      )?.proposal,
    ).toBe('approve');
  });

  it('request-info lever: off by default; on = asks to upload again', () => {
    const blurry = {
      result: 'manual_review' as const,
      similarity: null,
      reason: 'low_quality',
    };
    expect(decideAutomatically(allPass({ face: blurry }))?.proposal).toBe(
      'queue',
    );
    expect(
      decideAutomatically(allPass({ face: blurry, requestInfoEnabled: true })),
    ).toEqual({ proposal: 'request_info', reason: 'photo_low_quality' });
    expect(
      decideAutomatically(
        allPass({
          requestInfoEnabled: true,
          identity: { hasIdFront: true, missingBack: true, hasSelfie: true },
        }),
      ),
    ).toEqual({ proposal: 'request_info', reason: 'id_back_missing' });
    expect(
      decideAutomatically(
        allPass({
          requestInfoEnabled: true,
          ai: { decision: 'request_info', lane: 'bulk' },
        }),
      ),
    ).toEqual({ proposal: 'request_info', reason: 'ai_request_info' });
    // An uncertain registry result goes to a person, not to a retake
    // (owner 13.11); the registry's own «disbarred» still rejects.
    expect(
      decideAutomatically(
        allPass({
          requestInfoEnabled: true,
          face: blurry,
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'not_found' },
          ],
        }),
      ),
    ).toEqual({ proposal: 'queue', reason: 'registry_not_found' });
    expect(
      decideAutomatically(
        allPass({
          requestInfoEnabled: true,
          face: blurry,
          licenses: [
            { stateCode: 'NY', formatUnusual: false, registry: 'disciplined' },
          ],
        }),
      )?.proposal,
    ).toBe('reject');
  });
});

describe('audit sample (row 60)', () => {
  it('10 % until proven, then 5 %, then the floor', () => {
    expect(
      auditSamplePct(10, 2, agreementOf({ agreed: 0, disagreed: 0 })),
    ).toBe(10);
    expect(
      auditSamplePct(10, 2, agreementOf({ agreed: 40, disagreed: 0 })),
    ).toBe(10);
    expect(
      auditSamplePct(10, 2, agreementOf({ agreed: 48, disagreed: 2 })),
    ).toBe(5);
    expect(
      auditSamplePct(10, 2, agreementOf({ agreed: 45, disagreed: 5 })),
    ).toBe(10);
    expect(
      auditSamplePct(10, 2, agreementOf({ agreed: 198, disagreed: 2 })),
    ).toBe(2);
    // A floor set above the start never raises the sample.
    expect(
      auditSamplePct(3, 5, agreementOf({ agreed: 300, disagreed: 0 })),
    ).toBe(3);
  });

  it('routes about pct % of requests, the same request always the same way', () => {
    const ids = Array.from(
      { length: 4000 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const picked = ids.filter((id) => inAutoAuditSample(id, 10)).length;
    expect(picked).toBeGreaterThan(300);
    expect(picked).toBeLessThan(500);
    expect(inAutoAuditSample(ids[7], 10)).toBe(inAutoAuditSample(ids[7], 10));
    expect(ids.some((id) => inAutoAuditSample(id, 0))).toBe(false);
    expect(ids.every((id) => inAutoAuditSample(id, 100))).toBe(true);
  });

  it('keeps the face as a band, never the number', () => {
    expect(faceBand(97, 50, 90)).toBe('match');
    expect(faceBand(70, 50, 90)).toBe('unclear');
    expect(faceBand(20, 50, 90)).toBe('far_apart');
    expect(faceBand(null, 50, 90)).toBe('not_measured');
  });
});
