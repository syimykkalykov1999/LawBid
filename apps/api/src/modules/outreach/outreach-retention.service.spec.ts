import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  OutreachRetentionService,
  RETENTION_STATUSES,
  SYSTEM_ACTOR,
} from './outreach-retention.service';

type LeadRow = {
  id: string;
  phone: string | null;
  email: string | null;
  status: string;
  converted_user_id: string | null;
  last_activity_at: Date | null;
  created_at: Date;
  do_not_contact_at: Date | null;
};

/** A fake Prisma that applies the retention `where` the way the DB would. */
function fakePrisma(leads: LeadRow[], settings: unknown) {
  const suppressions: { kind: string; value: string; note: string | null }[] =
    [];
  const prisma = {
    appConfig: {
      findUnique: jest.fn(() => Promise.resolve({ value: settings })),
    },
    outreachLead: {
      findMany: jest.fn(
        (args: {
          where: {
            status: { in: string[] };
            OR: [
              { last_activity_at: { lt: Date } },
              { last_activity_at: null; created_at: { lt: Date } },
            ];
          };
          take: number;
        }) => {
          const before = args.where.OR[0].last_activity_at.lt;
          const rows = leads
            .filter(
              (l) =>
                l.converted_user_id === null &&
                args.where.status.in.includes(l.status) &&
                (l.last_activity_at
                  ? l.last_activity_at < before
                  : l.created_at < before),
            )
            .slice(0, args.take);
          return Promise.resolve(rows);
        },
      ),
      deleteMany: jest.fn((args: { where: { id: { in: string[] } } }) => {
        const ids = new Set(args.where.id.in);
        const n = leads.filter((l) => ids.has(l.id)).length;
        leads = leads.filter((l) => !ids.has(l.id));
        return Promise.resolve({ count: n });
      }),
    },
    outreachSuppression: {
      createMany: jest.fn(
        (args: {
          data: { kind: string; value: string; note: string | null }[];
        }) => {
          let count = 0;
          for (const d of args.data) {
            if (
              !suppressions.some(
                (s) => s.kind === d.kind && s.value === d.value,
              )
            ) {
              suppressions.push(d);
              count += 1;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
  return {
    prisma,
    suppressions,
    remaining: () => leads,
  };
}

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

const now = new Date('2026-10-05T03:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const lead = (p: Partial<LeadRow> & { id: string }): LeadRow => ({
  phone: null,
  email: null,
  status: 'new',
  converted_user_id: null,
  last_activity_at: null,
  created_at: daysAgo(400),
  do_not_contact_at: null,
  ...p,
});

describe('outreach: retention job', () => {
  it('deletes stale unconverted leads only, keeping do-not-contact contacts on the stop-list', async () => {
    const f = fakePrisma(
      [
        // Stale, never touched → deleted.
        lead({ id: 'stale', email: 'a@x.co', created_at: daysAgo(400) }),
        // Touched recently → kept.
        lead({
          id: 'active',
          created_at: daysAgo(400),
          last_activity_at: daysAgo(10),
        }),
        // Last activity long ago → deleted.
        lead({
          id: 'stale-activity',
          status: 'contacted',
          created_at: daysAgo(900),
          last_activity_at: daysAgo(366),
        }),
        // Converted → kept.
        lead({ id: 'converted', converted_user_id: 'u1' }),
        // Replied / registered / paid → kept.
        lead({ id: 'replied', status: 'replied' }),
        lead({ id: 'paid', status: 'paid' }),
        // Lost and do-not-contact → deleted, contacts suppressed.
        lead({
          id: 'dnc',
          status: 'lost',
          phone: '12125550100',
          email: 'dnc@x.co',
          do_not_contact_at: daysAgo(380),
        }),
        // Young → kept (365-day default).
        lead({ id: 'young', created_at: daysAgo(300) }),
      ],
      { leadRetentionDays: 365 },
    );
    const job = new OutreachRetentionService(
      f.prisma as unknown as PrismaService,
      logger,
    );
    const res = await job.run(now);
    expect(res).toEqual({ deleted: 3, suppressed: 2, retentionDays: 365 });
    expect(
      f
        .remaining()
        .map((l) => l.id)
        .sort(),
    ).toEqual(['active', 'converted', 'paid', 'replied', 'young']);
    expect(f.suppressions).toMatchObject([
      {
        kind: 'phone',
        value: '12125550100',
        note: 'retained from deleted lead',
      },
      { kind: 'email', value: 'dnc@x.co', note: 'retained from deleted lead' },
    ]);
    expect(f.prisma.outreachSuppression.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ created_by: SYSTEM_ACTOR }),
        ]),
        skipDuplicates: true,
      }),
    );
    // The contacts of a plain stale lead are not kept anywhere.
    expect(f.suppressions.some((s) => s.value === 'a@x.co')).toBe(false);
  });

  it('honours the configured retention and clamps it to the allowed range', async () => {
    const f = fakePrisma([lead({ id: 'l1', created_at: daysAgo(40) })], {
      leadRetentionDays: 30,
    });
    const job = new OutreachRetentionService(
      f.prisma as unknown as PrismaService,
      logger,
    );
    expect(await job.run(now)).toMatchObject({ deleted: 1, retentionDays: 30 });

    const g = fakePrisma(
      [lead({ id: 'l1', created_at: daysAgo(40) })],
      { leadRetentionDays: 5 }, // below the minimum → default 365
    );
    const job2 = new OutreachRetentionService(
      g.prisma as unknown as PrismaService,
      logger,
    );
    expect(await job2.run(now)).toEqual({
      deleted: 0,
      suppressed: 0,
      retentionDays: 365,
    });
    expect(g.remaining()).toHaveLength(1);
  });

  it('only covers the unconverted statuses', () => {
    expect(RETENTION_STATUSES).toEqual(['new', 'working', 'contacted', 'lost']);
  });
});
