import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { forEachDatabase } from '../../../sharding/for-each-database';
import {
  GENERAL_PRACTICE_CODE,
  NOT_SURE_OR_OTHER_CODE,
  type FeedGlobals,
} from './cases-visible.sql';

/**
 * Shard-ready step 8, FEED DECISION (scatter-read, not fan-out-on-write).
 *
 * The attorney case feed is "open cases matching my licences and topics,
 * newest first". Fan-out-on-write (a feed table per attorney, written when a
 * case is posted) is the answer when each reader follows a few authors and
 * the posting side is cheap (Instagram, Figma comments); here every case is
 * visible to every matching attorney (thousands to hundreds of thousands
 * of readers per case) and a case changes state (paused, closed, bid) often,
 * so a fan-out would write and then repair a huge number of rows. A scatter
 * read does `databases x one indexed query` and a k-way merge of the already
 * sorted pages (Notion and Figma both read across shards for lists and
 * search and keep write paths single-shard). The two cheap global lookups
 * (licences, topics) are done first, in application code.
 *
 * Revisit fan-out for the CLIENT home feed (many authors, follow graph) when
 * the post feed needs it; the case feed stays scatter-read.
 */
export async function resolveFeedGlobals(
  prisma: PrismaService,
  attorneyId: string,
  opts: { practiceCategory?: string; practice?: string },
): Promise<FeedGlobals> {
  const [licences, areas, notSure] = await Promise.all([
    prisma.attorneyLicense.findMany({
      where: { attorney_id: attorneyId, license_status: 'verified' },
      select: { state_code: true },
    }),
    prisma.attorneyPracticeArea.findMany({
      where: { attorney_id: attorneyId },
      select: {
        practice_area_id: true,
        practice_area: { select: { code: true } },
      },
    }),
    prisma.practiceArea.findFirst({
      where: { code: NOT_SURE_OR_OTHER_CODE },
      select: { id: true },
    }),
  ]);
  const licensed = [...new Set(licences.map((l) => l.state_code))];
  const topics = new Set(areas.map((a) => a.practice_area_id));
  if (
    notSure &&
    areas.some((a) => a.practice_area?.code === GENERAL_PRACTICE_CODE)
  ) {
    topics.add(notSure.id);
  }
  const stateTopics: Array<[string, string]> = [];
  for (const state of licensed) {
    for (const topic of topics) stateTopics.push([state, topic]);
  }
  const globals: FeedGlobals = {
    stateTopics,
    topics: [...topics],
    licensed,
  };
  if (opts.practiceCategory) {
    const leaves = await prisma.practiceArea.findMany({
      where: { parent: { code: opts.practiceCategory } },
      select: { id: true },
    });
    globals.categoryLeaves = leaves.map((l) => l.id);
  }
  if (opts.practice) {
    const found = await prisma.practiceArea.findMany({
      where: {
        OR: [
          { code: opts.practice },
          { code: { startsWith: `${opts.practice}.` } },
        ],
      },
      select: { id: true },
    });
    globals.practiceIds = found.map((f) => f.id);
  }
  return globals;
}

/** People the viewer blocked or who blocked the viewer (user family, both
 * directions; the second direction is spread over the databases). */
export async function blockedPeople(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    prisma.userBlock.findMany({
      where: { blocker_id: userId },
      select: { blocked_id: true },
    }),
    prisma.userBlock.findMany({
      where: { blocked_id: userId },
      select: { blocker_id: true },
    }),
  ]);
  return [
    ...new Set([
      ...mine.map((b) => b.blocked_id),
      ...theirs.map((b) => b.blocker_id),
    ]),
  ];
}

export interface FeedRow {
  id: string;
  created_at: Date;
}

/**
 * Runs the case-only feed statement on every database and merges the
 * (created_at DESC, id DESC) pages: each page is sorted, so the top `limit`
 * of the union is exactly the top `limit` of the whole.
 */
export async function scatterFeed(
  prisma: PrismaService,
  sql: Prisma.Sql,
  limit: number,
  /** Search: statement timeout / trigram threshold, set per database in the
   * same transaction as the query (SET LOCAL semantics). */
  budget?: { ms: number; trigram: string },
): Promise<FeedRow[]> {
  const parts = await forEachDatabase(prisma, async () => {
    if (!budget) return prisma.$queryRaw<FeedRow[]>(sql);
    const [, , rows] = await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('statement_timeout', ${String(Math.floor(budget.ms))}, true)`,
      prisma.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${budget.trigram}, true)`,
      prisma.$queryRaw<FeedRow[]>(sql),
    ]);
    return rows;
  });
  if (parts.length === 1) return parts[0];
  return parts
    .flat()
    .sort((a, b) => {
      const t = b.created_at.getTime() - a.created_at.getTime();
      if (t !== 0) return t;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(0, limit);
}
