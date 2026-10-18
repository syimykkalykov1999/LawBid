import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PresenceService } from '../../presence/presence.service';

/** Owner 2026-10-18 (OQ-054): the activity line on the feed card. */
export interface ClientActivityView {
  online: boolean;
  /** Whole days since the client was last in the app; null when online. */
  lastSeenDays: number | null;
  /** The client's median answer to bids / messages over the last 30 days
   * is within 24 h (needs at least 3 samples). */
  respondsWithinDay: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Samples older than this don't count. */
export const RESPONSE_WINDOW_DAYS = 30;
export const RESPONSE_MIN_SAMPLES = 3;
const RESPONSE_CACHE_TTL_SEC = 60 * 60;
const cacheKey = (clientId: string) => `case:resp24:${clientId}`;

/**
 * «В сети / Был …» and «Отвечает за день» on an attorney's case card.
 * Online / last seen come from PresenceService and obey the reciprocal
 * "activity status" privacy switch (the viewer's and the client's own):
 * hidden → no entry at all (the card shows no line). `respondsWithinDay`
 * is one cheap query over the clients on the page, cached in Redis for an
 * hour.
 */
@Injectable()
export class ClientActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async forClients(
    viewerId: string,
    clientIds: string[],
    now: Date = new Date(),
  ): Promise<Map<string, ClientActivityView>> {
    const out = new Map<string, ClientActivityView>();
    const ids = [...new Set(clientIds)];
    if (ids.length === 0) return out;
    const seen = await this.presence.snapshot(viewerId, ids);
    if (seen.size === 0) return out;
    const fast = await this.respondsWithinDay([...seen.keys()], now);
    for (const [id, p] of seen) {
      out.set(id, {
        online: p.online,
        lastSeenDays:
          p.online || !p.lastSeenAt
            ? null
            : Math.max(
                0,
                Math.floor((now.getTime() - p.lastSeenAt.getTime()) / DAY_MS),
              ),
        respondsWithinDay: fast.has(id),
      });
    }
    return out;
  }

  /** Clients whose median answer time is within a day. */
  async respondsWithinDay(
    clientIds: string[],
    now: Date = new Date(),
  ): Promise<Set<string>> {
    const fast = new Set<string>();
    if (clientIds.length === 0) return fast;
    let cached: (string | null)[] = clientIds.map(() => null);
    try {
      cached = await this.redis.mget(clientIds.map(cacheKey));
    } catch {
      // No cache: compute everything.
    }
    const missing: string[] = [];
    clientIds.forEach((id, i) => {
      const hit = cached[i];
      if (hit === null || hit === undefined) missing.push(id);
      else if (hit === '1') fast.add(id);
    });
    if (missing.length === 0) return fast;
    const since = new Date(now.getTime() - RESPONSE_WINDOW_DAYS * DAY_MS);
    const day = new Date(now.getTime() - DAY_MS);
    const rows = await this.prisma.$queryRaw<
      { client_id: string }[]
    >(Prisma.sql`
      WITH samples AS (
        -- An attorney's message (the first of a run) and the client's next
        -- message in the same case chat.
        SELECT cv.client_id,
               EXTRACT(EPOCH FROM (
                 (SELECT MIN(r.created_at) FROM messages r
                   WHERE r.conversation_id = m.conversation_id
                     AND r.sender_id = cv.client_id
                     AND r.created_at > m.created_at AND r.deleted_at IS NULL)
                 - m.created_at)) AS secs,
               m.created_at AS asked_at
        FROM conversations cv
        JOIN messages m ON m.conversation_id = cv.id
                       AND m.sender_id = cv.attorney_id
        WHERE cv.client_id = ANY(${missing}::UUID[]) AND cv.case_id IS NOT NULL
          AND m.created_at > ${since} AND m.deleted_at IS NULL
          AND COALESCE((SELECT p.sender_id FROM messages p
                         WHERE p.conversation_id = m.conversation_id
                           AND p.created_at < m.created_at
                         ORDER BY p.created_at DESC LIMIT 1),
                       cv.client_id) <> cv.attorney_id
        UNION ALL
        -- A bid on the client's case and their first reaction: a counter,
        -- an accept or a decline.
        SELECT c.client_id,
               EXTRACT(EPOCH FROM (
                 LEAST(
                   (SELECT MIN(o.created_at) FROM bid_offers o
                     WHERE o.bid_id = b.id AND o.from_role = 'client'),
                   CASE WHEN b.status IN ('accepted', 'rejected_by_client')
                        THEN b.updated_at END)
                 - b.created_at)) AS secs,
               b.created_at AS asked_at
        FROM bids b JOIN cases c ON c.id = b.case_id
        WHERE c.client_id = ANY(${missing}::UUID[])
          AND b.created_at > ${since}
          AND b.status IN ('active', 'accepted', 'rejected_by_client',
                           'failed_negotiation')
      ),
      -- Unanswered for over a day counts as a slow answer; unanswered for
      -- less is not a sample yet.
      timed AS (
        SELECT client_id,
               CASE WHEN secs IS NOT NULL THEN secs
                    WHEN asked_at < ${day} THEN 1e12 END AS secs
        FROM samples
      )
      SELECT client_id::TEXT AS client_id FROM timed
      WHERE secs IS NOT NULL
      GROUP BY client_id
      HAVING COUNT(*) >= ${RESPONSE_MIN_SAMPLES}
         AND percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) <= 86400`);
    const yes = new Set(rows.map((r) => r.client_id));
    for (const id of yes) fast.add(id);
    try {
      const pipe = this.redis.pipeline();
      for (const id of missing) {
        pipe.set(
          cacheKey(id),
          yes.has(id) ? '1' : '0',
          'EX',
          RESPONSE_CACHE_TTL_SEC,
        );
      }
      await pipe.exec();
    } catch {
      // The next request just computes it again.
    }
    return fast;
  }
}
