import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Gives the attorney [userId] one practice (owner 2026-11-05: the practices
 * step is mandatory before onboarding can be finished). The attorney profile
 * row must already exist (the onboarding profile step or the licence step
 * creates it).
 */
export async function attachPractice(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  // The e2e database is emptied before a run, so a suite that runs alone (or
  // on its own shard) may find no catalog row: make the one we need (same
  // code as ensurePostPractices, so both can coexist).
  const area = await prisma.practiceArea.upsert({
    where: { code: 'family_law' },
    create: {
      code: 'family_law',
      name_en: 'Family Law',
      i18n_key: 'practice.family_law',
      sort: 1,
    },
    update: {},
    select: { id: true },
  });
  await prisma.attorneyPracticeArea.create({
    data: { attorney_id: userId, practice_area_id: area.id },
  });
}
