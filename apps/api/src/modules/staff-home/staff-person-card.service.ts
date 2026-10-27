import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { StaffPersonHistoryDto } from './staff-home.dto';
import {
  STAFF_RECOMMENDATION_TEMPLATE,
  type StaffRecommendationTemplate,
} from './staff-recommendation.template';

const DAY_MS = 86_400_000;
const ACTIONS_SHOWN = 20;

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });

/** staff_quality_signals.kind in plain words. */
export const SIGNAL_LABEL: Record<string, string> = {
  reopened: 'решение вернулось',
  complaint: 'жалоба',
  appeal_won: 'обжалование выиграно',
  overturned: 'решение отменено при проверке',
  csat_up: 'довольный отзыв',
  csat_down: 'недовольный отзыв',
  sample_diff: 'расхождение при случайной проверке',
  golden_pass: 'эталонная задача решена',
  golden_fail: 'ошибка на эталонной задаче',
  too_fast: 'слишком быстрое решение',
  late_sla: 'просрочен срок',
  lease_lost: 'потерял закреплённый элемент',
};

/**
 * Staff package T10: the second half of a person's card — where the person
 * stands, the quality signals of the last 30 days (counted per kind), the last
 * actions taken (the legal journal) and the readable text of every open
 * suggestion. Owner only. Four small indexed reads (one person each); the
 * rating itself and the evidence come from T5's `admin/staff/people/:id`.
 */
@Injectable()
export class StaffPersonCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    @Inject(STAFF_RECOMMENDATION_TEMPLATE)
    private readonly template: StaffRecommendationTemplate,
  ) {}

  async history(
    admin: Pick<AdminActor, 'adminRole'>,
    adminId: string,
    now = new Date(),
  ): Promise<StaffPersonHistoryDto> {
    if (admin.adminRole !== 'super_admin') throw notFound();
    if (!(await this.staff.isOn('staff.rating_enabled'))) throw notFound();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [state, signals, actions, open] = await Promise.all([
      this.prisma.staffMemberState.findUnique({
        where: { admin_id: adminId },
        select: { state: true, state_until: true },
      }),
      this.prisma.staffQualitySignal.groupBy({
        by: ['kind'],
        where: { admin_id: adminId, created_at: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.staffAction.findMany({
        where: { admin_id: adminId },
        orderBy: { created_at: 'desc' },
        take: ACTIONS_SHOWN,
        select: {
          id: true,
          kind: true,
          source: true,
          reason_code: true,
          reason_note: true,
          created_at: true,
        },
      }),
      this.prisma.staffSuggestion.findMany({
        where: { admin_id: adminId, status: 'open' },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: { id: true, kind: true, evidence: true },
      }),
    ]);
    return {
      adminId,
      state: state?.state ?? 'active',
      stateUntil: state?.state_until?.toISOString() ?? null,
      signals: signals
        .map((s) => ({
          kind: s.kind,
          label: SIGNAL_LABEL[s.kind] ?? s.kind,
          count: s._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      actions: actions.map((a) => ({
        id: a.id,
        kind: a.kind,
        source: a.source,
        reasonCode: a.reason_code,
        reasonNote: a.reason_note,
        createdAt: a.created_at.toISOString(),
      })),
      recommendations: open.map((o) => ({
        suggestionId: o.id,
        kind: o.kind,
        recommendation: this.template.render({
          kind: o.kind,
          evidence:
            o.evidence && typeof o.evidence === 'object'
              ? (o.evidence as Record<string, unknown>)
              : {},
        }),
      })),
    };
  }
}
