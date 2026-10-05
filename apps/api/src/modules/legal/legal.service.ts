import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { PARTNER_TERMS_VERSION } from '../partners/partners.settings';
import type {
  DmcaAgentDto,
  LegalPublicDto,
  LegalSettingsDto,
} from './legal.dto';
import {
  LEGAL_SETTINGS_KEY,
  legalLangOf,
  readLegalSettings,
  type LegalSettings,
} from './legal.settings';

export const LEGAL_AUDIT = {
  settings: 'legal.settings',
  dmcaDecide: 'legal.dmca.decide',
} as const;

const toJson = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/**
 * Owner 2026-10-05 (legal): the `legal.settings` row — DMCA agent,
 * incident contact, repeat-infringer threshold and the app's short legal
 * texts — read by the app in the user's language and edited from the
 * admin (Система → Право и жалобы).
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  settings(): Promise<LegalSettings> {
    return readLegalSettings(this.prisma);
  }

  /** GET /legal/settings — texts in the user's UI language. */
  async publicSettings(userId: string): Promise<LegalPublicDto> {
    const [settings, user] = await Promise.all([
      this.settings(),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { ui_language: true },
      }),
    ]);
    return {
      dmcaAgent: settings.dmcaAgent,
      texts: settings.texts[legalLangOf(user?.ui_language)],
      partnerTermsVersion: PARTNER_TERMS_VERSION,
    };
  }

  /** GET /legal/dmca-agent (public, for the website). */
  async dmcaAgent(): Promise<DmcaAgentDto> {
    return (await this.settings()).dmcaAgent;
  }

  /** PUT /admin/legal/settings — whole row, audited before/after. */
  async updateSettings(
    admin: AdminActor,
    dto: LegalSettingsDto,
  ): Promise<LegalSettings> {
    const next: LegalSettings = {
      dmcaAgent: { ...dto.dmcaAgent },
      incidentContact: { ...dto.incidentContact },
      dmcaStrikesToSuspend: dto.dmcaStrikesToSuspend,
      texts: { en: { ...dto.texts.en }, ru: { ...dto.texts.ru } },
    };
    const value = toJson(next);
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: LEGAL_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: LEGAL_SETTINGS_KEY },
        create: { key: LEGAL_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: LEGAL_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    return next;
  }
}
