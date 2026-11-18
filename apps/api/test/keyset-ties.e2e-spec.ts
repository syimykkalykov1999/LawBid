import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ModerationAppealsService } from '../src/modules/moderation/moderation-appeals.service';
import { AdminGroupsService } from '../src/modules/groups/admin-groups.service';

/**
 * Row 215 (second part): the global admin lists page with createdKeyset()
 * — `created_at <= 9999-12-31` on the first page (so the partial
 * (created_at, id) index applies), createdBefore() on the next ones. Page
 * boundaries inside rows that share one created_at must neither repeat nor
 * skip a row. The rows are dated 2100 so they are the newest of the list
 * whatever other suites left in the database.
 */
jest.setTimeout(120_000);

describe('keyset pages over equal timestamps (row 215)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  const T = new Date('2100-01-01T00:00:00.000Z');
  const T2 = new Date('2100-01-01T00:00:01.000Z');

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    adminId = (
      await prisma.user.create({
        data: { role: 'admin', first_name: 'Keyset', last_name: 'Ties' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.moderationAction.deleteMany({ where: { admin_id: adminId } });
    await prisma.chatGroup.deleteMany({ where: { created_by: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await app.close();
  });

  it('moderation journal: limit 2 over 5 rows at one instant + 2 newer', async () => {
    const rows = [T, T, T, T, T, T2, T2].map((at) => ({
      admin_id: adminId,
      target_type: 'post' as const,
      target_id: adminId,
      action: 'hide' as const,
      created_at: at,
    }));
    await prisma.moderationAction.createMany({ data: rows });
    const expected = (
      await prisma.moderationAction.findMany({
        where: { admin_id: adminId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
    ).map((r) => r.id);
    expect(expected).toHaveLength(7);

    const journal = app.get(ModerationAppealsService);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 4; i++) {
      const page = await journal.journal({ limit: 2, cursor });
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
      if (!cursor) break;
    }
    // The first 7 rows of the journal are ours, in order, each once.
    expect(seen.slice(0, 7)).toEqual(expected);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('admin groups: a page boundary inside 32 groups created at one instant', async () => {
    const svc = app.get(AdminGroupsService);
    const before = await svc.list();
    const n = 32; // PAGE is 30: the boundary falls inside the tie
    for (let i = 0; i < n; i++) {
      await prisma.chatGroup.create({
        data: {
          title: `keyset tie ${i}`,
          created_by: adminId,
          invite_code: `kt${i}-${adminId.slice(0, 8)}`,
          created_at: T,
        },
      });
    }
    const expected = (
      await prisma.chatGroup.findMany({
        where: { created_by: adminId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
    ).map((r) => r.id);
    const p1 = await svc.list();
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await svc.list(undefined, p1.nextCursor ?? undefined);
    const ids = [...p1.items, ...p2.items].map((g) => g.id);
    expect(ids.slice(0, n)).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
    // The older groups follow right after ours.
    if (before.items.length > 0) expect(ids[n]).toBe(before.items[0].id);
  });
});
