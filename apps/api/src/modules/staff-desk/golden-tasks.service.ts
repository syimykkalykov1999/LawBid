import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { LeaseGolden } from '../work-lease/lease-golden';

const log = new Logger('GoldenTasks');

/** The kind the rating knows a lease kind by (both appeal queues are «appeal»). */
const RATING_KIND: Readonly<Record<string, string>> = {
  mod_appeal: 'appeal',
  review_appeal: 'appeal',
};

/** staff_review_samples.decision_kind of a golden task: `golden_<rating kind>`. */
export const goldenKindOf = (kind: string): string =>
  `golden_${RATING_KIND[kind] ?? kind}`;

/**
 * Staff package T4: the desk side of golden tasks. T5 (staff-rating) puts a
 * `golden_<kind>` row into `staff_review_samples` for a person: a past
 * decision with a known right answer. This service
 *  - tells the lease engine which golden task waits for a person in a queue
 *    (`pick`), so «Следующий» hands it out like any item;
 *  - checks the answer when the person closes it (`resolve`): same outcome =
 *    `golden_pass`, otherwise `golden_fail` (a quality signal for the
 *    rating, never an action against the person by itself).
 * Only the table is touched, so with T5 absent (no golden rows are ever
 * issued) or `staff.golden_enabled` off everything here is a quiet no-op.
 */
@Injectable()
export class GoldenTasksService implements LeaseGolden {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
  ) {}

  private async enabled(): Promise<boolean> {
    const s = await this.staff.get();
    return (
      s.switches['staff.rating_enabled'] && s.switches['staff.golden_enabled']
    );
  }

  async pick(adminId: string, kind: string): Promise<string | null> {
    if (!(await this.enabled())) return null;
    const row = await this.prisma.staffReviewSample.findFirst({
      where: {
        decided_by: adminId,
        decision_kind: goldenKindOf(kind),
        is_golden: true,
        status: 'pending',
      },
      orderBy: { created_at: 'asc' },
      select: { item_id: true },
    });
    return row?.item_id ?? null;
  }

  async resolve(
    adminId: string,
    kind: string,
    itemId: string,
    outcome: string,
  ): Promise<void> {
    if (!(await this.enabled())) return;
    const row = await this.prisma.staffReviewSample.findFirst({
      where: {
        decided_by: adminId,
        decision_kind: goldenKindOf(kind),
        item_id: itemId,
        is_golden: true,
        status: 'pending',
      },
    });
    if (!row) return;
    const known = (row.golden_answer as { outcome?: string } | null)?.outcome;
    const pass = known !== undefined && known === outcome;
    const done = await this.prisma.staffReviewSample.updateMany({
      where: { id: row.id, status: 'pending' },
      data: {
        status: 'done',
        verdict: pass ? 'same' : 'different',
        done_at: new Date(),
      },
    });
    if (done.count === 0) return;
    await this.prisma.staffQualitySignal
      .create({
        data: {
          admin_id: adminId,
          kind: pass ? 'golden_pass' : 'golden_fail',
          item_kind: row.decision_kind.slice(0, 24),
          item_id: itemId,
        },
      })
      .catch((e: unknown) => log.warn(`golden signal failed: ${String(e)}`));
  }
}
