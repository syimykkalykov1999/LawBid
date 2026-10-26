import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { SessionRevocationService } from '../auth/auth.public';
import { AccountAnonymizationService } from '../privacy/account-anonymization.service';
import type {
  MinorActionResultDto,
  MinorRowDto,
  SmsOptOutImportResultDto,
} from './admin-compliance.dto';
import { AgeGateService } from './age-gate.service';
import { EmailSuppressionService } from './email-suppression.service';
import { SmsComplianceService } from './sms-compliance.service';

export const COMPLIANCE_AUDIT = {
  minorFlag: 'compliance.minor.flag',
  minorClear: 'compliance.minor.clear',
  minorDelete: 'compliance.minor.delete',
  smsImport: 'compliance.sms.import_opt_outs',
} as const;

/**
 * 2026-10-25 (COPPA): the admin's tool for minors. Flag an account found
 * to belong to a person under 18 (sessions revoked, account suspended,
 * contacts put on the stop-lists so they never get marketing), then delete
 * it (the normal anonymization, immediately). Every step is audited; the
 * delete needs a fresh 2FA step-up in the controller. Also the import of
 * Twilio's opt-out export into the text-message stop-list.
 */
@Injectable()
export class AdminComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly sessions: SessionRevocationService,
    private readonly ageGate: AgeGateService,
    private readonly sms: SmsComplianceService,
    private readonly emails: EmailSuppressionService,
    @Optional() private readonly anonymization?: AccountAnonymizationService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  /** Flagged accounts, plus attested accounts whose birth date puts them
   * under the minimum age (the data says they are minors). */
  async list(now = new Date()): Promise<MinorRowDto[]> {
    const policy = await this.ageGate.policy();
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - policy.minAge);
    const rows = await this.prisma.ageAttestation.findMany({
      where: {
        OR: [
          { status: { in: ['flagged', 'deleted'] } },
          { birth_date: { gt: cutoff } },
        ],
      },
      orderBy: { attested_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      userId: r.user_id,
      status: r.status,
      birthDate: r.birth_date ? r.birth_date.toISOString().slice(0, 10) : null,
      flaggedAt: r.flagged_at?.toISOString() ?? null,
      flagReason: r.flag_reason,
      attestedAt: r.attested_at.toISOString(),
      textVersion: r.text_version,
    }));
  }

  async flag(
    admin: Pick<AdminActor, 'id' | 'ip'>,
    userId: string,
    reason: string,
    now = new Date(),
  ): Promise<MinorActionResultDto> {
    const user = await this.user(userId);
    const policy = await this.ageGate.policy();
    await this.prisma.ageAttestation.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        attested_at: now,
        text_version: 'admin',
        min_age: policy.minAge,
        source: 'admin',
        status: 'flagged',
        flagged_at: now,
        flagged_by: admin.id,
        flag_reason: reason,
      },
      update: {
        status: 'flagged',
        flagged_at: now,
        flagged_by: admin.id,
        flag_reason: reason,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended', suspended_reason: 'minor_suspected' },
    });
    await this.sessions.revokeAllChainsForUser(userId, 'minor_flagged');
    await this.stopContacts(user, now);
    await this.audit.record({
      adminId: admin.id,
      action: COMPLIANCE_AUDIT.minorFlag,
      targetType: 'user',
      targetId: userId,
      after: { reason },
      ip: admin.ip,
    });
    return { userId, result: 'flagged' };
  }

  /** The flag was a mistake: back to attested and active. */
  async clear(
    admin: Pick<AdminActor, 'id' | 'ip'>,
    userId: string,
  ): Promise<MinorActionResultDto> {
    const row = await this.prisma.ageAttestation.findUnique({
      where: { user_id: userId },
    });
    if (!row || row.status !== 'flagged') throw this.notFound();
    await this.prisma.ageAttestation.update({
      where: { user_id: userId },
      data: {
        status: 'attested',
        flagged_at: null,
        flagged_by: null,
        flag_reason: null,
      },
    });
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        status: 'suspended',
        suspended_reason: 'minor_suspected',
      },
      data: { status: 'active', suspended_reason: null },
    });
    await this.audit.record({
      adminId: admin.id,
      action: COMPLIANCE_AUDIT.minorClear,
      targetType: 'user',
      targetId: userId,
      ip: admin.ip,
    });
    return { userId, result: 'cleared' };
  }

  /** Deletes a FLAGGED account now (anonymization, not the 14-day wait).
   * A legal hold defers it; the daily anonymization job does not pick it
   * up on its own, so the response says `deletion_deferred`. */
  async deleteMinor(
    admin: Pick<AdminActor, 'id' | 'ip'>,
    userId: string,
    now = new Date(),
  ): Promise<MinorActionResultDto> {
    const row = await this.prisma.ageAttestation.findUnique({
      where: { user_id: userId },
    });
    if (!row || row.status === 'attested') throw this.notFound();
    const user = await this.user(userId);
    await this.stopContacts(user, now);
    await this.sessions.revokeAllChainsForUser(userId, 'minor_deleted');
    const done = this.anonymization
      ? await this.anonymization.anonymize(userId, now)
      : false;
    if (done) {
      await this.prisma.ageAttestation.update({
        where: { user_id: userId },
        data: { status: 'deleted', deleted_at: now },
      });
    }
    await this.audit.record({
      adminId: admin.id,
      action: COMPLIANCE_AUDIT.minorDelete,
      targetType: 'user',
      targetId: userId,
      after: { deleted: done },
      ip: admin.ip,
    });
    this.logger?.info(
      { metric: 'minor_deleted', done },
      'minor account deleted',
    );
    return { userId, result: done ? 'deleted' : 'deletion_deferred' };
  }

  async importSmsOptOuts(
    admin: Pick<AdminActor, 'id' | 'ip'>,
    phones: string[],
  ): Promise<SmsOptOutImportResultDto> {
    const res = await this.sms.importTwilioOptOuts(phones);
    await this.audit.record({
      adminId: admin.id,
      action: COMPLIANCE_AUDIT.smsImport,
      targetType: 'sms_suppression',
      targetId: 'bulk',
      after: res,
      ip: admin.ip,
    });
    return res;
  }

  // ---- helpers ---------------------------------------------------------------

  /** A minor's phone and e-mail never get marketing or outreach again. */
  private async stopContacts(
    user: { phone_e164: string | null; email: string | null },
    now: Date,
  ): Promise<void> {
    if (user.phone_e164) {
      await this.sms.suppress(user.phone_e164, 'admin', { now });
      await this.sms.revokeConsent(user.phone_e164, 'admin', now);
      await this.prisma.outreachSuppression.createMany({
        data: [
          {
            kind: 'phone',
            value: user.phone_e164.replace(/\D/g, ''),
            note: 'minor',
            created_by: '00000000-0000-0000-0000-000000000000',
            created_at: now,
          },
        ],
        skipDuplicates: true,
      });
    }
    if (user.email)
      await this.emails.add(user.email, 'manual', { detail: 'minor', now });
  }

  private async user(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, phone_e164: true, email: true },
    });
    if (!u) throw this.notFound();
    return u;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not found.',
    });
  }
}
