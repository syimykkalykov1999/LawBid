import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { anomalyDigestLine, scoreAnomalies } from './staff-anomaly.rules';
import { StaffCardWatch } from './staff-card-watch';

export interface AnomalyDayResult {
  day: string;
  admins: number;
  rows: number;
  digest: string;
}

/**
 * Staff package T11: yesterday's counters (StaffCardWatch) → the top-N
 * rows of `staff_anomalies` (unique per day + admin + rule, so a rerun
 * rewrites instead of duplicating) and the one digest line for the owner.
 * T10 renders the table; nothing here acts on anybody.
 */
@Injectable()
export class StaffAnomalyService {
  constructor(
    private readonly watch: StaffCardWatch,
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
  ) {}

  async computeDay(day: string): Promise<AnomalyDayResult> {
    const settings = await this.staff.get();
    const counters = await this.watch.readDay(day);
    const rows = scoreAnomalies(counters, {
      revealCap: settings.numbers['staff.reveal_per_day'],
      topN: settings.numbers['staff.anomalies.top_n'],
    });
    const date = new Date(`${day}T00:00:00.000Z`);
    for (const r of rows) {
      const detail = r.detail as Prisma.InputJsonValue;
      await this.prisma.staffAnomaly.upsert({
        where: {
          day_admin_id_rule: { day: date, admin_id: r.adminId, rule: r.rule },
        },
        create: {
          day: date,
          admin_id: r.adminId,
          rule: r.rule,
          score: r.score,
          detail,
        },
        update: { score: r.score, detail },
      });
    }
    return {
      day,
      admins: counters.size,
      rows: rows.length,
      digest: anomalyDigestLine(day, rows),
    };
  }
}
