import { Injectable } from '@nestjs/common';
import {
  HEAVY_METRICS,
  HeavyHittersService,
  type HeavyEntry,
} from '../../common/heavy-hitters/heavy-hitters.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import type { HeavyEntryDto, HeavyHittersDto } from './admin-ops.dto';

const TOP_N = 20;

/**
 * WP-G: the admin card «Тяжёлые пользователи»: top 20 users and cases per
 * metric over the last hour, with names looked up in two small queries.
 */
@Injectable()
export class HeavyHittersReportService {
  constructor(
    private readonly heavy: HeavyHittersService,
    private readonly prisma: PrismaService,
  ) {}

  async report(): Promise<HeavyHittersDto> {
    const lists = await Promise.all(
      HEAVY_METRICS.map(async (metric) => ({
        metric,
        users: await this.heavy.top(metric, 'user', TOP_N).catch(() => []),
        cases: await this.heavy.top(metric, 'case', TOP_N).catch(() => []),
      })),
    );
    const userIds = new Set<string>();
    const caseIds = new Set<string>();
    for (const l of lists) {
      l.users.forEach((e) => userIds.add(e.id));
      l.cases.forEach((e) => caseIds.add(e.id));
    }
    const [users, cases] = await Promise.all([
      userIds.size
        ? this.prisma.user.findMany({
            where: withDeleted({ id: { in: [...userIds] } }),
            select: {
              id: true,
              role: true,
              first_name: true,
              last_name: true,
            },
          })
        : [],
      caseIds.size
        ? this.prisma.case.findMany({
            where: { id: { in: [...caseIds] } },
            select: { id: true, title: true },
          })
        : [],
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const userRow = (e: HeavyEntry): HeavyEntryDto => {
      const u = userById.get(e.id);
      const name = u
        ? [u.first_name, u.last_name].filter(Boolean).join(' ')
        : '';
      return {
        id: e.id,
        score: e.score,
        label: name || null,
        role: u?.role ?? null,
      };
    };
    const caseRow = (e: HeavyEntry): HeavyEntryDto => ({
      id: e.id,
      score: e.score,
      label: caseById.get(e.id)?.title ?? null,
      role: null,
    });
    return {
      enabled: this.heavy.enabled,
      windowMinutes: this.heavy.windowMinutes,
      sampleEvery: this.heavy.sampleWeight,
      metrics: lists.map((l) => ({
        metric: l.metric,
        users: l.users.map(userRow),
        cases: l.cases.map(caseRow),
      })),
    };
  }
}
