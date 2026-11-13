import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AttorneyTrustService } from '../../attorney-trust/attorney-trust.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AdminSummaryService } from '../../../common/admin-summary/admin-summary.service';
import { ADMIN_COUNTS_SUMMARY_KEY } from '../../../common/admin-queues/admin-queues';
import {
  agreementOf,
  auditSamplePct,
  decideAutomatically,
  faceBand,
  inAutoAuditSample,
  requestInfoMessage,
  type AutoDecisionInput,
  type AutoVerdict,
  type RegistryVerdict,
} from '../auto-decision.logic';
import {
  IDENTITY_DOC_TYPES,
  IDENTITY_NEEDS_BACK,
  VERIFICATION_NOTIFICATION_KIND as KIND,
} from '../verification.constants';
import { syncProfileStatus } from '../verification.helpers';
import { DEFAULT_SIMILARITY_THRESHOLD } from '../providers/rekognition-id-verification.provider';
import { VerificationChecksService } from './verification-checks.service';

type Tx = Prisma.TransactionClient;

/** moderation_auto_actions.kind of an automatic verification rejection: the
 * attorney appeals it like any automatic decision (POST
 * /moderation/auto-actions/:id/appeal); an accepted appeal puts the request
 * back in the owner's queue (reopenAutoRejectedRequest). */
export const AUTO_REJECT_KIND = 'verification_reject';

export const AUTO_DECISION_APPROVED_NOTE =
  'Одобрено автоматически: реестр штата (номер, полное имя, активна), сравнение лица, живой человек и ИИ-сотрудник — всё совпало';
export const AUTO_DECISION_REJECTED_NOTE =
  'Отклонено автоматически: явное несовпадение (см. журнал автоматических решений); адвокат может обжаловать';
export const AUTO_DECISION_SAMPLE_NOTE =
  'Контрольная выборка: автоматическая проверка предлагает решение, решите сами';
export const AUTO_DECISION_INFO_NOTE =
  'Автоматически запрошено повторное фото / документ';

const PROPOSAL_RU: Record<string, string> = {
  approve: 'одобрить',
  reject: 'отклонить',
};

/**
 * Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам». Runs
 * after the automatic checks of a new request and again whenever the AI
 * employee proposes on it; decides only a request still `submitted`
 * (nobody took it). The rules are auto-decision.logic.ts; this service
 * reads the facts, writes the decision and its evidence in ONE transaction
 * (every write through `tx`, KE 123) and leaves the random audit sample in
 * the owner's queue. Switch off = returns at once, nothing written.
 */
@Injectable()
export class VerificationAutoDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly checks: VerificationChecksService,
    private readonly notifications: NotificationsService,
    private readonly trust: AttorneyTrustService,
    private readonly logger: PinoLogger,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {
    this.logger.setContext(VerificationAutoDecisionService.name);
    // After every automatic check run (best effort, never blocks a submit).
    checks.onChecksDone((id) => this.evaluateSafe(id));
  }

  /** Best effort: an error leaves the request in the queue, as today. */
  async evaluateSafe(requestId: string): Promise<void> {
    try {
      await this.evaluate(requestId);
    } catch (err) {
      this.logger.error(
        { err, requestId },
        'Automatic verification decision failed — the request stays in the queue',
      );
    }
  }

  /** Reads the facts and acts. Returns the outcome written, or null when
   * the rules did not run (switch off, staff account, not `submitted`, a
   * final decision already made). */
  async evaluate(requestId: string, now = new Date()): Promise<string | null> {
    if (!(await this.settings.boolean('verification.auto_decision.enabled')))
      return null;
    const existing = await this.prisma.verificationAutoDecision.findUnique({
      where: { request_id: requestId },
      select: { outcome: true },
    });
    if (existing && existing.outcome !== 'queue') return null;
    const facts = await this.facts(requestId);
    if (!facts) return null;
    const verdict = decideAutomatically(facts.input);
    if (!verdict) return null;
    let outcome: string = verdict.proposal;
    let samplePct = 0;
    if (verdict.proposal === 'approve' || verdict.proposal === 'reject') {
      samplePct = await this.samplePct();
      if (inAutoAuditSample(requestId, samplePct)) outcome = 'sample';
    }
    const evidence = this.evidence(facts, verdict, samplePct, now);
    const done = await withTxRetry(this.prisma, async (tx) => {
      // Still nobody's: a verifier who took it meanwhile wins.
      const req = await tx.verificationRequest.findUnique({
        where: { id: requestId },
        select: { status: true },
      });
      if (req?.status !== 'submitted') return false;
      let autoActionId: string | null = null;
      if (outcome === 'reject') {
        autoActionId = await this.reject(
          tx,
          facts.attorneyId,
          requestId,
          verdict,
          now,
        );
      } else if (outcome === 'request_info') {
        await this.requestInfo(tx, facts.attorneyId, requestId, verdict, now);
      } else if (outcome === 'sample') {
        await tx.verificationRequest.update({
          where: { id: requestId },
          data: {
            admin_note: `${AUTO_DECISION_SAMPLE_NOTE} (предлагает: ${PROPOSAL_RU[verdict.proposal]}${verdict.reason ? `, ${verdict.reason}` : ''})`,
          },
        });
      }
      const row = {
        attorney_id: facts.attorneyId,
        outcome,
        proposal: verdict.proposal,
        reason: verdict.reason,
        sample_pct: samplePct,
        evidence: evidence as Prisma.InputJsonObject,
        auto_action_id: autoActionId,
      };
      await tx.verificationAutoDecision.upsert({
        where: { request_id: requestId },
        create: { request_id: requestId, ...row },
        update: row,
      });
      return true;
    });
    if (!done) return null;
    if (outcome === 'approve') {
      // The same path as the registry auto-approval: licences verified, the
      // profile verified, the attorney notified, the trust level recomputed.
      await this.checks.approve(requestId, AUTO_DECISION_APPROVED_NOTE, now);
    } else if (outcome === 'reject' || outcome === 'request_info') {
      await this.trust.recompute(facts.attorneyId);
    }
    if (outcome !== 'queue' && outcome !== 'sample') {
      await this.summary?.dropFamily(ADMIN_COUNTS_SUMMARY_KEY);
    }
    this.logger.info(
      {
        requestId,
        outcome,
        proposal: verdict.proposal,
        reason: verdict.reason,
      },
      'Automatic verification decision',
    );
    return outcome;
  }

  /** The owner decided a request himself: a sampled one counts towards the
   * agreement rate that lowers the sample. Best effort. */
  async recordOwnerDecision(
    requestId: string,
    decision: 'approve' | 'reject' | 'request_info',
    now = new Date(),
  ): Promise<void> {
    try {
      await this.prisma.verificationAutoDecision.updateMany({
        where: {
          request_id: requestId,
          outcome: 'sample',
          owner_outcome: null,
        },
        data: { owner_outcome: decision, owner_at: now },
      });
    } catch (err) {
      this.logger.warn(
        { err, requestId },
        'Owner decision on an audit sample not recorded',
      );
    }
  }

  /** The audit sample in force: 10 % until the owner agreed, then 2-5 %. */
  async samplePct(): Promise<number> {
    const [start, min] = await Promise.all([
      this.settings.number('verification.auto_decision.audit_pct'),
      this.settings.number('verification.auto_decision.audit_pct_min'),
    ]);
    const groups = await this.prisma.verificationAutoDecision.groupBy({
      by: ['proposal', 'owner_outcome'],
      where: { outcome: 'sample', owner_outcome: { not: null } },
      _count: { _all: true },
    });
    let agreed = 0;
    let disagreed = 0;
    for (const g of groups) {
      if (g.owner_outcome === g.proposal) agreed += g._count._all;
      else disagreed += g._count._all;
    }
    return auditSamplePct(start, min, agreementOf({ agreed, disagreed }));
  }

  /** Agreement and sample for the admin and the runbook. */
  async stats(): Promise<{
    reviewed: number;
    agreed: number;
    ratePct: number | null;
    samplePct: number;
  }> {
    const groups = await this.prisma.verificationAutoDecision.groupBy({
      by: ['proposal', 'owner_outcome'],
      where: { outcome: 'sample', owner_outcome: { not: null } },
      _count: { _all: true },
    });
    let agreed = 0;
    let disagreed = 0;
    for (const g of groups) {
      if (g.owner_outcome === g.proposal) agreed += g._count._all;
      else disagreed += g._count._all;
    }
    const s = agreementOf({ agreed, disagreed });
    return {
      reviewed: s.reviewed,
      agreed: s.agreed,
      ratePct: s.ratePct,
      samplePct: await this.samplePct(),
    };
  }

  // ------------------------------------------------------------- facts

  private async facts(requestId: string) {
    const req = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        attorney_id: true,
        biometric_consent_at: true,
        biometric_consent_version: true,
        documents: {
          select: {
            doc_type: true,
            side: true,
            capture_meta: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
          take: 40,
        },
        checks: {
          select: {
            check_type: true,
            provider: true,
            result: true,
            details: true,
            checked_at: true,
          },
          orderBy: { checked_at: 'desc' },
          take: 60,
        },
        attorney: {
          select: {
            user: {
              select: {
                role: true,
                admin_profile: { select: { user_id: true } },
              },
            },
            licenses: {
              where: { license_status: 'pending' },
              select: { id: true, state_code: true, registry_flag: true },
              take: 20,
            },
          },
        },
      },
    });
    if (!req) return null;
    const [
      enabled,
      rejectBelow,
      threshold,
      personaRequired,
      requestInfoEnabled,
    ] = await Promise.all([
      this.settings.boolean('verification.auto_decision.enabled'),
      this.settings.number('verification.auto_decision.face_reject_below'),
      this.settings
        .number('verification.face_match.similarity_threshold')
        .catch(() => DEFAULT_SIMILARITY_THRESHOLD),
      this.settings.boolean(
        'verification.auto_decision.persona_document_enabled',
      ),
      this.settings.boolean(
        'verification.auto_decision.ai_request_info_enabled',
      ),
    ]);
    const user = req.attorney.user;
    const licenses = req.attorney.licenses.map((l) => {
      const latest = req.checks.find(
        (c) =>
          c.check_type === 'bar_lookup' &&
          (c.details as { licenseId?: unknown } | null)?.licenseId === l.id,
      );
      return {
        id: l.id,
        stateCode: l.state_code,
        formatUnusual: l.registry_flag === 'format_unusual',
        registry: registryVerdict(latest),
      };
    });
    const types = new Set(req.documents.map((d) => d.doc_type as string));
    const idDocs = req.documents.filter((d) =>
      (IDENTITY_DOC_TYPES as readonly string[]).includes(d.doc_type),
    );
    const idType = idDocs[0]?.doc_type;
    const missingBack =
      !!idType &&
      (IDENTITY_NEEDS_BACK as readonly string[]).includes(idType) &&
      !idDocs.some((d) => d.doc_type === idType && d.side === 'back');
    const selfie = req.documents.find((d) => d.doc_type === 'selfie');
    const meta = (selfie?.capture_meta ?? null) as Record<
      string,
      unknown
    > | null;
    const liveness =
      !!meta &&
      meta.source === 'app_camera' &&
      meta.tokenVerified === true &&
      meta.liveness === 'passed';
    const faceRow = req.checks.find((c) => c.check_type === 'face_match');
    const fd = (faceRow?.details ?? {}) as Record<string, unknown>;
    const face: AutoDecisionInput['face'] = {
      result: faceRow?.result ?? 'none',
      similarity: typeof fd.similarity === 'number' ? fd.similarity : null,
      reason: typeof fd.reason === 'string' ? fd.reason : null,
    };
    const personaPassed = req.checks.some(
      (c) =>
        c.provider === 'persona' &&
        c.check_type === 'id_check' &&
        c.result === 'pass',
    );
    const aiItem = await this.prisma.aiRunItem.findFirst({
      where: {
        item_id: requestId,
        status: { in: ['proposed', 'approved'] },
        run: { role: { queue: 'attorney_verification' } },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        decision: true,
        lane: true,
        confidence: true,
        status: true,
      },
    });
    const input: AutoDecisionInput = {
      enabled,
      staffAccount: user.role === 'admin' || user.admin_profile !== null,
      status: req.status,
      consent: req.biometric_consent_at !== null,
      licenses,
      identity: {
        hasIdFront: idDocs.some((d) => d.side !== 'back'),
        missingBack,
        hasSelfie: types.has('selfie'),
      },
      face,
      faceRejectBelow: rejectBelow,
      liveness,
      ai: aiItem
        ? { decision: aiItem.decision ?? 'unclear', lane: aiItem.lane }
        : null,
      persona: { required: personaRequired, passed: personaPassed },
      requestInfoEnabled,
    };
    return {
      input,
      attorneyId: req.attorney_id,
      threshold,
      consentVersion: req.biometric_consent_version,
      licenseIds: licenses.map((l) => l.id),
      aiItem,
      faceProvider: typeof fd.provider === 'string' ? fd.provider : null,
      faceCheckedAt: faceRow?.checked_at ?? null,
    };
  }

  /** All the evidence of the decision (the audit row). The face similarity
   * itself is kept as a band only (the biometric number is deleted with the
   * face match row by privacy.retention). */
  private evidence(
    f: NonNullable<
      Awaited<ReturnType<VerificationAutoDecisionService['facts']>>
    >,
    v: AutoVerdict,
    samplePct: number,
    now: Date,
  ): Record<string, unknown> {
    const i = f.input;
    return {
      at: now.toISOString(),
      rules: 'row60-v1',
      proposal: v.proposal,
      reason: v.reason,
      samplePct,
      consent: { given: i.consent, version: f.consentVersion },
      licenses: i.licenses.map((l, n) => ({
        licenseId: f.licenseIds[n],
        state: l.stateCode,
        registry: l.registry,
        formatUnusual: l.formatUnusual,
      })),
      identity: i.identity,
      face: {
        result: i.face.result,
        reason: i.face.reason,
        band: faceBand(i.face.similarity, i.faceRejectBelow, f.threshold),
        threshold: f.threshold,
        rejectBelow: i.faceRejectBelow,
        provider: f.faceProvider,
        checkedAt: f.faceCheckedAt?.toISOString() ?? null,
      },
      liveness: i.liveness,
      ai: f.aiItem
        ? {
            itemId: f.aiItem.id,
            decision: f.aiItem.decision,
            lane: f.aiItem.lane,
            confidence: f.aiItem.confidence,
            status: f.aiItem.status,
          }
        : null,
      persona: i.persona,
      requestInfoEnabled: i.requestInfoEnabled,
    };
  }

  // ------------------------------------------------------------- actions

  /** Like the verifier's «Отклонить», without a verifier (verified_by
   * null), plus the appealable automatic-decision row. Bar numbers are not
   * blocked: a person decides that on appeal or a new request. */
  private async reject(
    tx: Tx,
    attorneyId: string,
    requestId: string,
    v: AutoVerdict,
    now: Date,
  ): Promise<string> {
    const code = v.reason ?? 'other';
    await tx.attorneyLicense.updateMany({
      where: { attorney_id: attorneyId, license_status: 'pending' },
      data: { license_status: 'rejected', rejection_code: code },
    });
    await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        reviewed_at: now,
        rejection_code: code,
        rejection_reason: null,
        admin_note: AUTO_DECISION_REJECTED_NOTE,
      },
    });
    await syncProfileStatus(tx, attorneyId, 'rejected', now);
    const verifiedLeft = await tx.attorneyLicense.count({
      where: { attorney_id: attorneyId, license_status: 'verified' },
    });
    if (verifiedLeft === 0) {
      await tx.attorneyProfile.updateMany({
        where: { user_id: attorneyId, verification_status: 'verified' },
        data: { verification_status: 'unverified' },
      });
    }
    const action = await tx.moderationAutoAction.create({
      data: {
        kind: AUTO_REJECT_KIND,
        user_id: attorneyId,
        target_id: requestId,
        score: 1,
        threshold: 1,
        borderline: false,
        enforced: true,
        reason: code,
      },
      select: { id: true },
    });
    await this.notifications.emit(
      {
        type: 'verification_update',
        recipientId: attorneyId,
        payload: {
          kind: KIND.rejected,
          requestId,
          rejectionCode: code,
          automatic: true,
          autoActionId: action.id,
        },
      },
      tx,
    );
    return action.id;
  }

  /** Like the verifier's «Запросить информацию», with a fixed message. */
  private async requestInfo(
    tx: Tx,
    attorneyId: string,
    requestId: string,
    v: AutoVerdict,
    now: Date,
  ): Promise<void> {
    const message = requestInfoMessage(v.reason);
    await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: 'needs_more_info',
        info_request_message: message,
        admin_note: AUTO_DECISION_INFO_NOTE,
      },
    });
    await syncProfileStatus(tx, attorneyId, 'needs_more_info', now);
    await this.notifications.emit(
      {
        type: 'verification_update',
        recipientId: attorneyId,
        payload: { kind: KIND.needsMoreInfo, requestId, message },
      },
      tx,
    );
  }
}

/** The newest `bar_lookup` check of a licence → the rules' verdict. */
export function registryVerdict(
  c: { result: string; details: unknown } | undefined,
): RegistryVerdict {
  if (!c) return 'none';
  const reason = (c.details as { reason?: unknown } | null)?.reason;
  if (c.result === 'pass') return 'pass';
  if (c.result === 'fail')
    return reason === 'not_active' ? 'not_active' : 'not_found';
  return reason === 'name_mismatch' ? 'name_mismatch' : 'unavailable';
}

/**
 * An accepted appeal of an automatic rejection (AutoAppealsService): the
 * request goes back to the owner's queue (`submitted`), the licences the
 * rejection closed go back to pending, the profile to pending. The
 * decision row stays (outcome reject) so the rules never decide it again.
 */
export async function reopenAutoRejectedRequest(
  tx: Tx,
  requestId: string,
  now = new Date(),
): Promise<boolean> {
  const req = await tx.verificationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, attorney_id: true, rejection_code: true },
  });
  if (!req || req.status !== 'rejected') return false;
  // Only one open request per attorney (docs/03 §2.3).
  const open = await tx.verificationRequest.count({
    where: {
      attorney_id: req.attorney_id,
      id: { not: req.id },
      status: { in: ['draft', 'submitted', 'in_review', 'needs_more_info'] },
    },
  });
  if (open > 0) return false;
  await tx.attorneyLicense.updateMany({
    where: {
      attorney_id: req.attorney_id,
      license_status: 'rejected',
      verified_by: null,
      rejection_code: req.rejection_code,
    },
    data: { license_status: 'pending', rejection_code: null },
  });
  await tx.verificationRequest.update({
    where: { id: req.id },
    data: {
      status: 'submitted',
      reviewed_at: null,
      reviewed_by: null,
      rejection_code: null,
      admin_note:
        'Апелляция на автоматический отказ принята: решите заявку сами',
    },
  });
  await syncProfileStatus(tx, req.attorney_id, 'submitted', now);
  return true;
}
