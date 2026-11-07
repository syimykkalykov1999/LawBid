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
  const area = await prisma.practiceArea.findFirstOrThrow({
    where: { is_active: true },
    select: { id: true },
  });
  await prisma.attorneyPracticeArea.create({
    data: { attorney_id: userId, practice_area_id: area.id },
  });
}
