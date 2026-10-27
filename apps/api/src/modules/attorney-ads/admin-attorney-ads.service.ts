import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type { AttorneyAdArchive, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AttorneyAdvertisingService } from '../countries/attorney-advertising.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  type AdArchiveQueryDto,
  type AdArchiveRowDto,
  type UpdateAttorneyAdsSettingsDto,
} from './attorney-ads.dto';
import { AttorneyAdsService } from './attorney-ads.service';
import {
  ATTORNEY_ADS_SETTINGS_KEY,
  parseAttorneyAdsSettings,
  type AttorneyAdsSettings,
} from './attorney-ads.settings';
import { AD_RULES } from './ad-rules';

export const ATTORNEY_ADS_AUDIT = {
  settings: 'attorney_ads.settings',
  export: 'attorney_ads.export',
} as const;

const EXPORT_MAX = 5000;

/** Quotes a cell; a leading = + - @ is neutralised (spreadsheet formulas). */
const csv = (v: string): string =>
  `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

function row(r: AttorneyAdArchive): AdArchiveRowDto {
  return {
    id: r.id,
    attorneyId: r.attorney_id,
    kind: r.kind,
    sourceId: r.source_id,
    version: r.version,
    content: r.content,
    disclaimers: r.disclaimers,
    findings: r.findings,
    stateCodes: r.state_codes,
    createdAt: r.created_at.toISOString(),
    retainUntil: r.retain_until.toISOString(),
  };
}

/** Owner 2026-10-28: the admin side — settings, rule catalogue, archive. */
@Injectable()
export class AdminAttorneyAdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ads: AttorneyAdsService,
    private readonly audit: AuditLogService,
    @Optional() private readonly advertising?: AttorneyAdvertisingService,
  ) {}

  getSettings(): Promise<AttorneyAdsSettings> {
    return this.ads.settings();
  }

  rules() {
    return this.ads.catalogue();
  }

  async updateSettings(
    admin: AdminActor,
    dto: UpdateAttorneyAdsSettingsDto,
  ): Promise<AttorneyAdsSettings> {
    const current = await this.ads.settings();
    const known = new Set(AD_RULES.map((r) => r.id));
    const next = parseAttorneyAdsSettings({
      defaults: { ...current.defaults, ...(dto.defaults ?? {}) },
      states: dto.states ?? current.states,
      paidPlacementLabel: dto.paidPlacementLabel ?? current.paidPlacementLabel,
    });
    const unknown = [next.defaults, ...Object.values(next.states)].flatMap(
      (r) => (r.disabledRules ?? []).filter((x) => !known.has(x)),
    );
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Unknown rule id: ${unknown[0]}.`,
      });
    }
    const value = next as unknown as Prisma.InputJsonValue;
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: ATTORNEY_ADS_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: ATTORNEY_ADS_SETTINGS_KEY },
        create: { key: ATTORNEY_ADS_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: ATTORNEY_ADS_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    this.ads.invalidate();
    this.advertising?.invalidate();
    return next;
  }

  private where(q: AdArchiveQueryDto): Prisma.AttorneyAdArchiveWhereInput {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if ((from && isNaN(+from)) || (to && isNaN(+to))) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'from / to must be ISO dates.',
      });
    }
    return {
      ...(q.attorneyId ? { attorney_id: q.attorneyId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.state ? { state_codes: { has: q.state } } : {}),
      ...(from || to
        ? {
            created_at: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: to } : {}),
            },
          }
        : {}),
    };
  }

  async list(
    q: AdArchiveQueryDto,
  ): Promise<{ items: AdArchiveRowDto[]; nextCursor: string | null }> {
    const limit = q.limit ?? 50;
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.attorneyAdArchive.findMany({
      where: {
        AND: [
          this.where(q),
          cursor
            ? {
                OR: [
                  { created_at: { lt: cursor.createdAt } },
                  { created_at: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(row),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** CSV of the archive under the same filters (up to 5 000 rows). */
  async exportCsv(admin: AdminActor, q: AdArchiveQueryDto): Promise<string> {
    const rows = await this.prisma.attorneyAdArchive.findMany({
      where: this.where(q),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: EXPORT_MAX,
    });
    const head =
      'id,attorney_id,kind,source_id,version,created_at,retain_until,states,findings,disclaimers,content';
    const lines = rows.map((r) =>
      [
        r.id,
        r.attorney_id,
        r.kind,
        r.source_id,
        String(r.version),
        r.created_at.toISOString(),
        r.retain_until.toISOString(),
        csv(r.state_codes.join(' ')),
        csv(r.findings.join(' ')),
        csv(r.disclaimers.join(' | ')),
        csv(r.content),
      ].join(','),
    );
    const out = [head, ...lines].join('\n');
    await this.audit.record({
      adminId: admin.id,
      action: ATTORNEY_ADS_AUDIT.export,
      targetType: 'attorney_ad_archive',
      targetId: null,
      after: { rows: rows.length, filters: { ...q } },
      ip: admin.ip,
    });
    return out;
  }
}
