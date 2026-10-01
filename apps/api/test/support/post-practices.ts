import type { PrismaService } from '../../src/prisma/prisma.service';

/** Owner 2026-09-30: posts need a qualification; the e2e database is
 * emptied before a run, so the codes posts use in tests are created here. */
export async function ensurePostPractices(prisma: PrismaService) {
  const upsert = (code: string, nameEn: string, parentId?: string) =>
    prisma.practiceArea.upsert({
      where: { code },
      create: {
        code,
        name_en: nameEn,
        i18n_key: `practice.${code}`,
        sort: 1,
        parent_id: parentId,
      },
      update: {},
    });
  await upsert('family_law', 'Family Law');
  const civil = await upsert('civil_litigation', 'Civil Litigation');
  await upsert(
    'civil_litigation.arbitration_and_mediation_representation',
    'Arbitration and Mediation Representation',
    civil.id,
  );
  // Audit 2026-10-01: the wizard's "Not sure" choice and its category.
  const general = await upsert('general_practice', 'General Practice');
  await upsert(
    'general_practice.general_practice',
    'General Practice',
    general.id,
  );
  await upsert(
    'general_practice.not_sure_or_other',
    'Not Sure or Other',
    general.id,
  );
}
