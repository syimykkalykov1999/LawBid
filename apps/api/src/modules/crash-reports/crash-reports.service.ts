import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  CrashDetailDto,
  CrashGroupDto,
  CrashReportInDto,
} from './crash-reports.dto';

const KEEP_DAYS = 30;

/** The same crash from different phones gets the same fingerprint: the
 * error's type and its first stack lines with numbers (lines, addresses,
 * ids) taken out. */
export function crashFingerprint(message: string, stack: string): string {
  const clean = (s: string) =>
    s
      .replace(/0x[0-9a-f]+/gi, '')
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '',
      )
      .replace(/:\d+(:\d+)?/g, '')
      .replace(/\d+/g, '#')
      .trim();
  const top = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5)
    .map(clean)
    .join('|');
  return createHash('sha1')
    .update(`${clean(message).slice(0, 120)}|${top}`)
    .digest('hex');
}

/** Owner 2026-10-15: own crash intake — free, in our database. */
@Injectable()
export class CrashReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async ingest(
    reports: CrashReportInDto[],
    deviceKey: string | null,
  ): Promise<number> {
    // Owner 2026-10-15: kill switch (flag `crash_reports`, on by default):
    // the batch is accepted and dropped, the phone just clears its queue.
    if (this.flags && !(await this.flags.isEnabled('crash_reports', true))) {
      return 0;
    }
    const rows = reports.slice(0, 10).map((r) => ({
      fingerprint: crashFingerprint(r.message, r.stack),
      message: r.message.slice(0, 500),
      stack: r.stack.slice(0, 6000),
      fatal: r.fatal ?? false,
      platform: r.platform.slice(0, 12),
      app_version: r.appVersion.slice(0, 30),
      build: r.build.slice(0, 20),
      flavor: r.flavor.slice(0, 12),
      os_version: r.osVersion.slice(0, 40),
      device_model: r.deviceModel.slice(0, 60),
      device_key: deviceKey?.slice(0, 80) ?? null,
      route: r.route?.slice(0, 120) ?? null,
    }));
    if (rows.length === 0) return 0;
    const res = await this.prisma.crashReport.createMany({ data: rows });
    return res.count;
  }

  /** Crashes grouped, the most frequent in the period first. */
  async groups(days: number): Promise<CrashGroupDto[]> {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await this.prisma.$queryRaw<
      {
        fingerprint: string;
        message: string;
        n: bigint;
        devices: bigint;
        fatal: bigint;
        versions: string[];
        first_at: Date;
        last_at: Date;
      }[]
    >`
      SELECT fingerprint,
             (array_agg(message ORDER BY created_at DESC))[1] AS message,
             count(*) AS n,
             count(DISTINCT device_key) AS devices,
             count(*) FILTER (WHERE fatal) AS fatal,
             array_agg(DISTINCT app_version) AS versions,
             min(created_at) AS first_at, max(created_at) AS last_at
      FROM crash_reports
      WHERE created_at > ${since}
      GROUP BY fingerprint
      ORDER BY count(*) DESC, max(created_at) DESC
      LIMIT 100`;
    return rows.map((r) => ({
      fingerprint: r.fingerprint,
      message: r.message,
      count: Number(r.n),
      devices: Number(r.devices),
      fatal: Number(r.fatal),
      versions: r.versions,
      firstAt: r.first_at.toISOString(),
      lastAt: r.last_at.toISOString(),
    }));
  }

  async detail(fingerprint: string): Promise<CrashDetailDto> {
    const latest = await this.prisma.crashReport.findMany({
      where: { fingerprint },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    const by = async (col: 'app_version' | 'os_version' | 'device_model') =>
      (
        await this.prisma.crashReport.groupBy({
          by: [col],
          where: { fingerprint },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 8,
        })
      ).map((g) => ({ value: String(g[col]), count: g._count._all }));
    return {
      fingerprint,
      stack: latest[0]?.stack ?? '',
      message: latest[0]?.message ?? '',
      versions: await by('app_version'),
      systems: await by('os_version'),
      devices: await by('device_model'),
      latest: latest.map((c) => ({
        at: c.created_at.toISOString(),
        appVersion: c.app_version,
        build: c.build,
        flavor: c.flavor,
        platform: c.platform,
        osVersion: c.os_version,
        deviceModel: c.device_model,
        route: c.route,
        fatal: c.fatal,
      })),
    };
  }

  /** "Fixed": the admin clears a group. */
  async resolve(fingerprint: string): Promise<void> {
    await this.prisma.crashReport.deleteMany({ where: { fingerprint } });
  }

  async purge(): Promise<{ deleted: number }> {
    const deleted = await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM crash_reports
        WHERE created_at < now() - make_interval(days => ${KEEP_DAYS}::INT)`,
    );
    return { deleted };
  }
}
