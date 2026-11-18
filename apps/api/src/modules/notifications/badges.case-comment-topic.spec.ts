import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { BadgesService } from './badges.service';

/**
 * Verify batch 8 (17.11), NO5: an assistant's comment on a case
 * (`assistant_request` with `kind: 'case_comment'`) is pushed by the switch
 * «Ассистент: дела» (topicOf), but the badge counted it by its type's switch
 * «Ассистент: сообщения». The badge now follows the same topicOf rule, so a
 * switched-off kind never counts and a switched-on one always does.
 *
 * The count's SQL is evaluated here against a few rows with the same
 * filter the database applies (type muted list + the case-comment flag).
 */
type R = { type: string; kind?: string };

function run(topics: Record<string, boolean>, rows: R[]): Promise<number> {
  const prisma = {
    notificationSetting: { findMany: () => Promise.resolve([]) },
    user: {
      findUnique: () =>
        Promise.resolve({ notif_topics: topics, notif_icon_badge: true }),
    },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (!sql.includes('FROM notifications')) {
        return Promise.resolve([{ n: 0n }]);
      }
      const muted = values.find((v) => Array.isArray(v)) as string[];
      // The flag bound for an assistant's case comment, when the SQL has one.
      const special = sql.includes(`payload->>'kind'`);
      const caseMuted = values.find((v) => typeof v === 'boolean') === true;
      const n = rows.filter((r) => {
        if (
          special &&
          r.type === 'assistant_request' &&
          r.kind === 'case_comment'
        ) {
          return !caseMuted;
        }
        return !muted.includes(r.type);
      }).length;
      return Promise.resolve([{ n: BigInt(n) }]);
    },
  } as unknown as PrismaService;
  const redis = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
  } as unknown as Redis;
  const svc = new BadgesService(prisma, redis, {} as RealtimePublisher);
  return (
    svc as unknown as { countNotifications(id: string): Promise<number> }
  ).countNotifications('u1');
}

const rows: R[] = [
  { type: 'assistant_request', kind: 'case_comment' },
  { type: 'assistant_request', kind: 'message' },
];

describe('BadgesService: an assistant case comment counts by its own switch (NO5)', () => {
  it('«Ассистент: дела» off → the case comment does not count', async () => {
    expect(await run({ assistantCases: false }, rows)).toBe(1);
  });

  it('«Ассистент: сообщения» off, «дела» on → the case comment still counts', async () => {
    expect(
      await run({ assistantMessages: false, assistantCases: true }, rows),
    ).toBe(1);
  });

  it('both on → both count', async () => {
    expect(await run({}, rows)).toBe(2);
  });
});
