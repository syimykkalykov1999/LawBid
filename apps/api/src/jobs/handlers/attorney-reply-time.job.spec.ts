import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttorneyReplyTimeJob, medianMinutes } from './attorney-reply-time.job';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

function setup(opts: {
  enabled?: boolean;
  minChats?: number;
  gaps?: { attorney_id: string; gaps: number[] }[];
}) {
  const sqlSeen: string[] = [];
  const updates: unknown[][] = [];
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    sqlSeen.push(sql);
    if (sql.includes('FROM attorney_profiles')) {
      // One batch of three, then the walk ends.
      return Promise.resolve(
        sqlSeen.filter((s) => s.includes('FROM attorney_profiles')).length === 1
          ? [{ user_id: A }, { user_id: B }, { user_id: C }]
          : [],
      );
    }
    return Promise.resolve(opts.gaps ?? []);
  });
  const executeRaw = jest.fn(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlSeen.push(strings.join('?'));
      updates.push(values);
      return Promise.resolve(2);
    },
  );
  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  } as unknown as PrismaService;
  const settings = {
    boolean: jest.fn(() => Promise.resolve(opts.enabled ?? true)),
    number: jest.fn((key: string) =>
      Promise.resolve(
        key === 'profile.reply_time_min_chats' ? (opts.minChats ?? 3) : 90,
      ),
    ),
  } as unknown as AppSettingsService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
  } as unknown as PinoLogger;
  return {
    job: new AttorneyReplyTimeJob(prisma, settings, logger),
    sqlSeen,
    updates,
  };
}

describe('medianMinutes', () => {
  it('middle value, mean of the middle two, null when empty', () => {
    expect(medianMinutes([])).toBeNull();
    expect(medianMinutes([30, 5, 600])).toBe(30);
    expect(medianMinutes([10, 20, 30, 41])).toBe(25);
    expect(medianMinutes([7])).toBe(7);
  });
});

describe('AttorneyReplyTimeJob', () => {
  it('writes the median for attorneys with enough answered chats, null for the rest', async () => {
    const { job, updates, sqlSeen } = setup({
      gaps: [
        { attorney_id: A, gaps: [10, 50, 30] },
        { attorney_id: B, gaps: [5] },
      ],
    });
    const out = await job.run(3);
    expect(out).toEqual({ scanned: 3, changed: 2 });
    const [ids, medians] = updates[0];
    expect(ids).toEqual([A, B, C]);
    // A: 3 chats (median 30); B: 1 chat < 3; C: none.
    expect(medians).toEqual([30, null, null]);
    // Only attorney-client chats, the client's first message, the reply after.
    const gapsSql = sqlSeen.find((s) => s.includes('FROM conversations'))!;
    expect(gapsSql).toContain("c.pair_kind = 'attorney_client'");
    expect(gapsSql).toContain('m.sender_id = c.client_id');
    expect(gapsSql).toContain('m.created_at > q.asked');
  });

  it('switched off: no chat is read and every value becomes null', async () => {
    const { job, updates, sqlSeen } = setup({
      enabled: false,
      gaps: [{ attorney_id: A, gaps: [10, 20, 30] }],
    });
    await job.run(3);
    expect(sqlSeen.some((s) => s.includes('FROM conversations'))).toBe(false);
    expect(updates[0][1]).toEqual([null, null, null]);
  });

  it('only rows whose value changed are rewritten', async () => {
    const { job, sqlSeen } = setup({});
    await job.run(3);
    const update = sqlSeen.find((x) => x.includes('UPDATE attorney_profiles'))!;
    expect(update).toContain('ap.reply_minutes_median IS DISTINCT FROM t.m');
  });
});
