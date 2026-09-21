// LawBid — idempotent Prisma seed script.
//
// Stage 1.3 scope (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.3", acceptance:
// "Миграции + seed (админ, языки en/ru, флаги)"): seeds only the tables
// modeled in this stage's schema.prisma. Ordering follows
// docs/02_DATABASE.md §7.2 ("states → practice_areas → i18n_languages →
// blocked_email_domains → feature_flags → app_config → legal_documents →
// admin"), filtered down to the tables that exist at this stage — states,
// practice_areas and app_config are seeded in the stages that add those
// tables (2.1 and 1.8 respectively), not here.
//
// All upserts are idempotent: re-running this script must never create
// duplicates (docs/02_DATABASE.md §7.2).
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

// docs/01_FOUNDATION_AUTH.md §3.3 / §3.3: en is default+active, ru active.
async function seedI18nLanguages(): Promise<void> {
  const languages = [
    {
      code: 'en',
      name_native: 'English',
      is_active: true,
      is_rtl: false,
      sort: 0,
    },
    {
      code: 'ru',
      name_native: 'Русский',
      is_active: true,
      is_rtl: false,
      sort: 1,
    },
  ];
  for (const lang of languages) {
    await prisma.i18nLanguage.upsert({
      where: { code: lang.code },
      create: lang,
      update: lang,
    });
  }
  console.log(`  i18n_languages: ${languages.length} upserted (en, ru)`);
}

// docs/02_DATABASE.md §3.3: privaterelay.appleid.com (apple_relay) + a
// disposable-domains list loaded from disposable_domains.txt. See that
// file's header for why it's a starter list, not the full open list.
async function seedBlockedEmailDomains(): Promise<void> {
  const disposablePath = join(__dirname, 'seed', 'disposable_domains.txt');
  const disposableDomains = readFileSync(disposablePath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const rows: { domain: string; reason: string }[] = [
    { domain: 'privaterelay.appleid.com', reason: 'apple_relay' },
    ...disposableDomains.map((domain) => ({ domain, reason: 'disposable' })),
  ];

  for (const row of rows) {
    await prisma.blockedEmailDomain.upsert({
      where: { domain: row.domain },
      create: row,
      update: row,
    });
  }
  console.log(`  blocked_email_domains: ${rows.length} upserted`);
}

// docs/01_FOUNDATION_AUTH.md §15, "Этап 1.8": exact starter flag list and
// values, seeded here (stage 1.3) because stage 1.3's own acceptance
// criterion requires flags to exist; the flags MODULE (Redis cache,
// GET /config/bootstrap) is still stage 1.8 work, not built yet.
async function seedFeatureFlags(): Promise<void> {
  const flags = [
    {
      key: 'video_posts',
      enabled: false,
      description: 'Video attachments on feed posts',
    },
    {
      key: 'profile_promotion',
      enabled: false,
      description: 'Paid attorney profile promotion',
    },
    {
      key: 'stripe_identity',
      enabled: false,
      description: 'Stripe Identity as a verification provider',
    },
    {
      key: 'persona_verification',
      enabled: false,
      description: 'Persona as a verification provider',
    },
    {
      key: 'auto_bar_check',
      enabled: false,
      description: 'Automatic bar-number lookup against state databases',
    },
    { key: 'phone_login', enabled: true, description: 'Phone/SMS OTP login' },
    { key: 'email_login', enabled: true, description: 'Email OTP login' },
    { key: 'apple_login', enabled: true, description: 'Sign in with Apple' },
    { key: 'google_login', enabled: true, description: 'Sign in with Google' },
  ];
  for (const flag of flags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: { ...flag, rollout_percent: 100 },
      update: { enabled: flag.enabled, description: flag.description },
    });
  }
  console.log(`  feature_flags: ${flags.length} upserted`);
}

// docs/02_DATABASE.md §3.3: "заглушки текстов ... для en (тексты
// предоставляет владелец/юрист)". These are explicitly placeholder text,
// not real legal copy — real ToS/Privacy/Disclaimer text must come from
// the product owner/lawyer before launch, per the spec's own note.
async function seedLegalDocuments(): Promise<void> {
  const docs = [
    { doc_type: 'terms' as const, title: 'Terms of Service' },
    { doc_type: 'privacy' as const, title: 'Privacy Policy' },
    { doc_type: 'disclaimer' as const, title: 'Legal Disclaimer' },
    {
      doc_type: 'client_contact_sharing' as const,
      title: 'Client Contact Sharing Consent',
    },
  ];
  const version = '1.0';
  const locale = 'en';
  for (const doc of docs) {
    await prisma.legalDocument.upsert({
      where: {
        doc_type_version_locale: { doc_type: doc.doc_type, version, locale },
      },
      create: {
        doc_type: doc.doc_type,
        version,
        locale,
        content_md: `# ${doc.title}\n\nPLACEHOLDER — this stub must be replaced with real text supplied by the product owner/lawyer before production (docs/02_DATABASE.md §3.3).`,
        published_at: new Date(),
        is_current: true,
      },
      update: {},
    });
  }
  console.log(`  legal_documents: ${docs.length} upserted (en, v${version})`);
}

// docs/02_DATABASE.md §3.3: "Админ super_admin: создаётся seed-скриптом
// из переменных окружения (SEED_ADMIN_EMAIL), без пароля по умолчанию в
// репозитории." Skips cleanly (with a warning) if the env var is unset,
// so the seed stays safe to run in dev/CI without it.
async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.warn(
      '  admin: SEED_ADMIN_EMAIL not set — skipping admin user seed',
    );
    return;
  }
  const existing = await prisma.user.findFirst({
    where: { email, role: 'admin' },
  });
  if (existing) {
    console.log(`  admin: ${email} already exists (${existing.id})`);
    return;
  }
  const admin = await prisma.user.create({
    data: {
      role: 'admin',
      status: 'active',
      email,
      email_verified_at: new Date(),
      ui_language: 'en',
    },
  });
  console.log(`  admin: created ${email} (${admin.id})`);
}

async function main(): Promise<void> {
  console.log('Seeding LawBid (stage 1.3 scope)...');
  // Order per docs/02_DATABASE.md §7.2, filtered to stage-1.3 tables.
  await seedI18nLanguages();
  await seedBlockedEmailDomains();
  await seedFeatureFlags();
  await seedLegalDocuments();
  await seedAdmin();
  console.log('Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
