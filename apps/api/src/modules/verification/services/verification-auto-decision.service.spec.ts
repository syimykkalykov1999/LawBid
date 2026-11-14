import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import { inAutoAuditSample } from '../auto-decision.logic';
import type { VerificationChecksService } from './verification-checks.service';
import {
  AUTO_DECISION_APPROVED_NOTE,
  AUTO_DECISION_HUMAN_NOTE,
  AUTO_REJECT_KIND,
  VerificationAutoDecisionService,
  registryVerdict,
  reopenAutoRejectedRequest,
} from './verification-auto-decision.service';

const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

/** A request id outside / inside the 10 % audit sample. */
const ids = Array.from(
  { length: 200 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
);
const NOT_SAMPLED = ids.find((id) => !inAutoAuditSample(id, 10))!;
const SAMPLED = ids.find((id) => inAutoAuditSample(id, 10))!;

interface Opts {
  enabled?: boolean;
  registry?: { result: string; reason?: string; status?: string };
  face?: { result: string; similarity: number | null; reason?: string };
  consent?: boolean;
  liveness?: boolean;
  ai?: { decision: string; lane: string } | null;
  role?: string;
  adminProfile?: boolean;
  status?: string;
  existing?: string;
  adminNote?: string | null;
}

function setup(o: Opts = {}) {
  const settings: Record<string, unknown> = {
    'verification.auto_decision.enabled': o.enabled ?? true,
    'verification.auto_decision.face_reject_below': 50,
    'verification.face_match.similarity_threshold': 90,
    'verification.auto_decision.persona_document_enabled': false,
    'verification.auto_decision.ai_request_info_enabled': false,
    'verification.auto_decision.audit_pct': 10,
    'verification.auto_decision.audit_pct_min': 2,
  };
  const s = {
    boolean: jest.fn((k: string) => Promise.resolve(settings[k] as boolean)),
    number: jest.fn((k: string) => Promise.resolve(settings[k] as number)),
  } as unknown as AppSettingsService;
  const face = o.face ?? { result: 'pass', similarity: 98 };
  const reg = o.registry ?? { result: 'pass' };
  const request = (id: string) => ({
    id,
    status: o.status ?? 'submitted',
    admin_note: o.adminNote ?? null,
    attorney_id: 'a1',
    biometric_consent_at: o.consent === false ? null : new Date('2026-11-12'),
    biometric_consent_version: '2026-11-12',
    documents: [
      {
        doc_type: 'passport',
        side: 'front',
        capture_meta: null,
        created_at: new Date(),
      },
      {
        doc_type: 'selfie',
        side: null,
        capture_meta:
          o.liveness === false
            ? { source: 'unknown' }
            : { source: 'app_camera', tokenVerified: true, liveness: 'passed' },
        created_at: new Date(),
      },
    ],
    checks: [
      {
        check_type: 'face_match',
        provider: 'manual',
        result: face.result,
        details: {
          provider: 'aws_rekognition',
          similarity: face.similarity,
          ...(face.reason ? { reason: face.reason } : {}),
        },
        checked_at: new Date(),
      },
      {
        check_type: 'bar_lookup',
        provider: 'manual',
        result: reg.result,
        details: {
          licenseId: 'l1',
          ...(reg.reason ? { reason: reg.reason } : {}),
          ...(reg.status ? { registryStatus: reg.status } : {}),
        },
        checked_at: new Date(),
      },
    ],
    attorney: {
      user: {
        role: o.role ?? 'attorney',
        admin_profile: o.adminProfile ? { user_id: 'a1' } : null,
      },
      licenses: [{ id: 'l1', state_code: 'NY', registry_flag: null }],
    },
  });
  const upsert = jest.fn().mockResolvedValue({});
  const requestUpdate = jest.fn().mockResolvedValue({});
  const autoActionCreate = jest.fn().mockResolvedValue({ id: 'm1' });
  const licenseUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const decisionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findRequest = jest.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(request(where.id)),
  );
  const prisma = {
    verificationRequest: { findUnique: findRequest, update: requestUpdate },
    verificationAutoDecision: {
      findUnique: jest
        .fn()
        .mockResolvedValue(o.existing ? { outcome: o.existing } : null),
      upsert,
      updateMany: decisionUpdateMany,
      groupBy: jest.fn().mockResolvedValue([]),
    },
    aiRunItem: {
      findFirst: jest.fn().mockResolvedValue(
        o.ai === null
          ? null
          : {
              id: 'ai1',
              decision: o.ai?.decision ?? 'approve',
              lane: o.ai?.lane ?? 'bulk',
              confidence: 96,
              status: 'proposed',
            },
      ),
    },
    attorneyLicense: {
      updateMany: licenseUpdateMany,
      count: jest.fn().mockResolvedValue(0),
    },
    attorneyProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    moderationAutoAction: { create: autoActionCreate },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: unknown }).$transaction = (
    fn: (tx: PrismaService) => Promise<unknown>,
  ) => fn(prisma);
  const approve = jest.fn().mockResolvedValue(undefined);
  let hook: ((id: string) => Promise<void>) | null = null;
  const checks = {
    approve,
    onChecksDone: (fn: (id: string) => Promise<void>) => {
      hook = fn;
    },
  } as unknown as VerificationChecksService;
  const emit = jest.fn().mockResolvedValue(undefined);
  const trust = {
    recompute: jest.fn().mockResolvedValue(null),
  } as unknown as AttorneyTrustService;
  const svc = new VerificationAutoDecisionService(
    prisma,
    s,
    checks,
    { emit } as unknown as NotificationsService,
    trust,
    logger,
  );
  return {
    svc,
    prisma,
    approve,
    upsert,
    requestUpdate,
    autoActionCreate,
    licenseUpdateMany,
    decisionUpdateMany,
    findRequest,
    emit,
    hook: () => hook,
  };
}

describe('VerificationAutoDecisionService (row 60)', () => {
  it('registers itself after the automatic checks', () => {
    expect(setup().hook()).not.toBeNull();
  });

  it('all pass → approved through the registry auto-approval path, evidence stored', async () => {
    const t = setup();
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('approve');
    expect(t.approve).toHaveBeenCalledWith(
      NOT_SAMPLED,
      AUTO_DECISION_APPROVED_NOTE,
      expect.any(Date),
    );
    const row = t.upsert.mock.calls[0][0].create;
    expect(row).toMatchObject({
      request_id: NOT_SAMPLED,
      attorney_id: 'a1',
      outcome: 'approve',
      proposal: 'approve',
    });
    expect(row.evidence).toMatchObject({
      consent: { given: true, version: '2026-11-12' },
      licenses: [{ licenseId: 'l1', state: 'NY', registry: 'pass' }],
      face: { result: 'pass', band: 'match', threshold: 90, rejectBelow: 50 },
      liveness: true,
      ai: { itemId: 'ai1', decision: 'approve', lane: 'bulk' },
    });
    // The biometric number itself is not copied into the audit row.
    expect(row.evidence.face).not.toHaveProperty('similarity');
  });

  it('registry record «Disbarred» → rejected with the reject code and an appealable automatic decision', async () => {
    const t = setup({
      registry: { result: 'fail', reason: 'not_active', status: 'Disbarred' },
      ai: null,
    });
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('reject');
    expect(t.approve).not.toHaveBeenCalled();
    expect(t.requestUpdate).toHaveBeenCalledWith({
      where: { id: NOT_SAMPLED },
      data: expect.objectContaining({
        status: 'rejected',
        rejection_code: 'license_inactive',
      }),
    });
    expect(t.licenseUpdateMany).toHaveBeenCalledWith({
      where: { attorney_id: 'a1', license_status: 'pending' },
      data: { license_status: 'rejected', rejection_code: 'license_inactive' },
    });
    expect(t.autoActionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: AUTO_REJECT_KIND,
        user_id: 'a1',
        target_id: NOT_SAMPLED,
        enforced: true,
      }),
      select: { id: true },
    });
    expect(t.upsert.mock.calls[0][0].create).toMatchObject({
      outcome: 'reject',
      reason: 'license_inactive',
      auto_action_id: 'm1',
    });
    expect(t.upsert.mock.calls[0][0].create.evidence.licenses[0].registry).toBe(
      'disciplined',
    );
    expect(t.emit.mock.calls[0][0].payload).toMatchObject({
      kind: 'rejected',
      rejectionCode: 'license_inactive',
      autoActionId: 'm1',
    });
  });

  // Owner 13.11 (row 60): uncertain → the human queue with the reason.
  it.each([
    [
      'registry not found',
      { registry: { result: 'fail', reason: 'not_found' }, ai: null },
      'registry_not_found',
    ],
    [
      'registry error',
      { registry: { result: 'manual_review', reason: 'provider_error' } },
      'registry_unavailable',
    ],
    [
      'registry timeout / budget',
      { registry: { result: 'manual_review', reason: 'budget_exceeded' } },
      'registry_unavailable',
    ],
    [
      'registry «Retired» (inactive, not discipline)',
      { registry: { result: 'fail', reason: 'not_active', status: 'Retired' } },
      'registry_not_active',
    ],
    [
      'face 30 %',
      { face: { result: 'fail', similarity: 30, reason: 'selfie_mismatch' } },
      'face_far_apart',
    ],
  ] as const)(
    '%s → human queue, never a reject, reason in the note',
    async (_name, opts, reason) => {
      const t = setup(opts);
      expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('queue');
      expect(t.approve).not.toHaveBeenCalled();
      expect(t.autoActionCreate).not.toHaveBeenCalled();
      expect(t.licenseUpdateMany).not.toHaveBeenCalled();
      expect(t.emit).not.toHaveBeenCalled();
      expect(t.requestUpdate).toHaveBeenCalledTimes(1);
      expect(t.requestUpdate).toHaveBeenCalledWith({
        where: { id: NOT_SAMPLED },
        data: {
          admin_note: expect.stringMatching(
            new RegExp(`^${AUTO_DECISION_HUMAN_NOTE}: .+`),
          ),
        },
      });
      expect(t.upsert.mock.calls[0][0].create).toMatchObject({
        outcome: 'queue',
        proposal: 'queue',
        reason,
        auto_action_id: null,
      });
    },
  );

  it('a face 30 % is kept as the far-apart band in the evidence', async () => {
    const t = setup({
      face: { result: 'fail', similarity: 30, reason: 'selfie_mismatch' },
    });
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('queue');
    expect(t.upsert.mock.calls[0][0].create.evidence.face.band).toBe(
      'far_apart',
    );
  });

  it('the uncertain note never replaces a verifier or recheck note', async () => {
    const t = setup({
      registry: { result: 'fail', reason: 'not_found' },
      adminNote: 'license_recheck: NY l1',
    });
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('queue');
    expect(t.requestUpdate).not.toHaveBeenCalled();
  });

  it('anything missing → stays in the queue, only the evidence row is written', async () => {
    const t = setup({ liveness: false });
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('queue');
    expect(t.approve).not.toHaveBeenCalled();
    expect(t.requestUpdate).not.toHaveBeenCalled();
    expect(t.upsert.mock.calls[0][0].create).toMatchObject({
      outcome: 'queue',
      reason: 'liveness_not_passed',
    });
  });

  it('switch off → nothing read, nothing written', async () => {
    const t = setup({ enabled: false });
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBeNull();
    expect(t.findRequest).not.toHaveBeenCalled();
    expect(t.upsert).not.toHaveBeenCalled();
    expect(t.approve).not.toHaveBeenCalled();
  });

  it('never for an owner or staff account', async () => {
    for (const o of [{ role: 'admin' }, { adminProfile: true }]) {
      const t = setup(o);
      expect(await t.svc.evaluate(NOT_SAMPLED)).toBeNull();
      expect(t.upsert).not.toHaveBeenCalled();
      expect(t.approve).not.toHaveBeenCalled();
    }
  });

  it('no automatic decision without the biometric consent', async () => {
    const t = setup({
      consent: false,
      face: { result: 'fail', similarity: 10 },
    });
    expect(await t.svc.evaluate(NOT_SAMPLED)).toBe('queue');
    expect(t.approve).not.toHaveBeenCalled();
    expect(t.autoActionCreate).not.toHaveBeenCalled();
    expect(t.upsert.mock.calls[0][0].create.reason).toBe(
      'no_biometric_consent',
    );
  });

  it('sample routing: a sampled request stays with the owner with the proposal noted', async () => {
    const t = setup();
    expect(await t.svc.evaluate(SAMPLED)).toBe('sample');
    expect(t.approve).not.toHaveBeenCalled();
    expect(t.requestUpdate).toHaveBeenCalledWith({
      where: { id: SAMPLED },
      data: { admin_note: expect.stringContaining('Контрольная выборка') },
    });
    expect(t.upsert.mock.calls[0][0].create).toMatchObject({
      outcome: 'sample',
      proposal: 'approve',
      sample_pct: 10,
    });
  });

  it('a final decision is never taken twice; a request a person took is left alone', async () => {
    const done = setup({ existing: 'reject' });
    expect(await done.svc.evaluate(NOT_SAMPLED)).toBeNull();
    expect(done.findRequest).not.toHaveBeenCalled();
    const taken = setup({ status: 'in_review' });
    expect(await taken.svc.evaluate(NOT_SAMPLED)).toBeNull();
    expect(taken.upsert).not.toHaveBeenCalled();
  });

  it("records the owner's own decision on a sampled request", async () => {
    const t = setup();
    await t.svc.recordOwnerDecision('r1', 'reject');
    expect(t.decisionUpdateMany).toHaveBeenCalledWith({
      where: { request_id: 'r1', outcome: 'sample', owner_outcome: null },
      data: { owner_outcome: 'reject', owner_at: expect.any(Date) },
    });
  });

  it('the sample drops once the owner agreed', async () => {
    const t = setup();
    (t.prisma.verificationAutoDecision.groupBy as jest.Mock).mockResolvedValue([
      { proposal: 'approve', owner_outcome: 'approve', _count: { _all: 199 } },
      { proposal: 'reject', owner_outcome: 'approve', _count: { _all: 1 } },
    ]);
    expect(await t.svc.samplePct()).toBe(2);
  });
});

describe('registryVerdict', () => {
  it('maps the stored bar_lookup check', () => {
    expect(registryVerdict(undefined)).toBe('none');
    expect(registryVerdict({ result: 'pass', details: {} })).toBe('pass');
    expect(
      registryVerdict({ result: 'fail', details: { reason: 'not_found' } }),
    ).toBe('not_found');
    expect(
      registryVerdict({ result: 'fail', details: { reason: 'not_active' } }),
    ).toBe('not_active');
    expect(
      registryVerdict({
        result: 'fail',
        details: { reason: 'not_active', registryStatus: 'Retired' },
      }),
    ).toBe('not_active');
    for (const st of ['Disbarred', 'SUSPENDED', 'License Revoked'])
      expect(
        registryVerdict({
          result: 'fail',
          details: { reason: 'not_active', registryStatus: st },
        }),
      ).toBe('disciplined');
    expect(
      registryVerdict({
        result: 'manual_review',
        details: { reason: 'name_mismatch' },
      }),
    ).toBe('name_mismatch');
    expect(
      registryVerdict({
        result: 'manual_review',
        details: { reason: 'provider_error' },
      }),
    ).toBe('unavailable');
  });
});

describe('reopenAutoRejectedRequest (accepted appeal)', () => {
  it('puts the request back in the queue and its licences back to pending', async () => {
    const update = jest.fn().mockResolvedValue({});
    const licenses = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      verificationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          status: 'rejected',
          attorney_id: 'a1',
          rejection_code: 'license_not_found',
        }),
        count: jest.fn().mockResolvedValue(0),
        update,
      },
      attorneyLicense: { updateMany: licenses },
      attorneyProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ verification_status: 'rejected' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    expect(
      await reopenAutoRejectedRequest(
        tx as never,
        'r1',
        new Date('2026-11-12'),
      ),
    ).toBe(true);
    expect(licenses).toHaveBeenCalledWith({
      where: {
        attorney_id: 'a1',
        license_status: 'rejected',
        verified_by: null,
        rejection_code: 'license_not_found',
      },
      data: { license_status: 'pending', rejection_code: null },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        status: 'submitted',
        rejection_code: null,
      }),
    });
  });

  it('does nothing when the attorney already has another open request', async () => {
    const tx = {
      verificationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          status: 'rejected',
          attorney_id: 'a1',
          rejection_code: 'x',
        }),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
    };
    expect(await reopenAutoRejectedRequest(tx as never, 'r1')).toBe(false);
    expect(tx.verificationRequest.update).not.toHaveBeenCalled();
  });
});
