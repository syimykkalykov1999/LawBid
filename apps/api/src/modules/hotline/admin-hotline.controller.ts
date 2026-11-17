import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { pipeline } from '../../redis/redis-cluster-safe';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import { HotlineLiveDto } from './hotline.dto';
import { HotlineService } from './hotline.service';

const HOURS = 24;
const TOP = 50;

/**
 * Owner 16.11 ~19:15: a live admin view of the whole hotline — who is on the
 * line, queue sizes, calls now, the last 24 hourly aggregates — from Valkey
 * only (no database query; the hourly hashes are the «tiny aggregate» the
 * nightly snapshot reads). Exact numbers here: only the owner's staff sees
 * them; clients see bands.
 */
@ApiTags('admin-hotline')
@AdminEndpoint('super_admin', 'support')
@Controller('admin/hotline')
export class AdminHotlineController {
  constructor(private readonly hotline: HotlineService) {}

  @Get('live')
  @ApiOperation({ summary: 'Hotline now: line, queues, calls (Valkey only)' })
  @ApiEnvelopeResponse(HotlineLiveDto)
  async adminHotlineLive(): Promise<HotlineLiveDto> {
    const h = this.hotline;
    const k = h.k;
    const redis = h.redis;
    const now = h.nowMs();
    const lawyers = await redis.hvals(k.lst);
    const count = (pred: (s: string) => boolean) => lawyers.filter(pred).length;
    const reqs = await redis.hvals(k.rst);
    const offline = await redis.scard(k.off);
    const queued = reqs.filter((s) => s === 'q').length;
    const buckets = (await redis.smembers(k.buckets)).slice(0, 5000);
    const p = pipeline(redis);
    for (const b of buckets) {
      p.scard(k.bucketLawyers(b));
      p.zcard(k.queue(b));
    }
    const res = buckets.length ? ((await p.exec()) ?? []) : [];
    const rows = buckets
      .map((bucket, i) => ({
        bucket,
        lawyers: Number(res[2 * i]?.[1] ?? 0),
        waiting: Number(res[2 * i + 1]?.[1] ?? 0),
      }))
      .filter((r) => r.lawyers > 0 || r.waiting > 0)
      .sort((a, b) => b.waiting - a.waiting || b.lawyers - a.lawyers)
      .slice(0, TOP);
    const hp = pipeline(redis);
    const hours: string[] = [];
    for (let i = 0; i < HOURS; i++) {
      const hour = h.hour(now - i * 3_600_000);
      hours.push(hour);
      hp.hgetall(k.agg(hour));
    }
    const hres = (await hp.exec()) ?? [];
    return {
      enabled: await h.enabled(),
      onLine: await redis.zcount(k.alive, now, '+inf'),
      idle: count((s) => s === 'i'),
      offered: count((s) => s.startsWith('o|')),
      inCall: count((s) => s.startsWith('b|')),
      notAccepting: count((s) => s === 'n'),
      paused: count((s) => s === 'p'),
      waitingOnline: Math.max(0, queued - offline),
      waitingOffline: offline,
      callsNow: reqs.filter((s) => s.startsWith('c|')).length,
      buckets: rows,
      hours: hours.map((hour, i) => {
        const a = (hres[i]?.[1] ?? {}) as Record<string, string>;
        const n = (f: string) => Number(a[f] ?? 0);
        return {
          hour,
          requests: n('requests'),
          offers: n('offers'),
          accepted: n('accepted'),
          declined: n('declined'),
          timeouts: n('timeouts'),
          ended: n('ended'),
          talkSeconds: n('talkSeconds'),
          notices: n('notices'),
          peakOnline: n('peakOnline'),
        };
      }),
    };
  }
}
