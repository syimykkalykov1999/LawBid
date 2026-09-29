// LawBid — idempotent Prisma seed script.
//
// Stage 1.3 scope (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.3", acceptance:
// "Миграции + seed (админ, языки en/ru, флаги)"): seeds only the tables
// modeled in this stage's schema.prisma. Ordering follows
// docs/02_DATABASE.md §7.2 ("states → practice_areas → i18n_languages →
// blocked_email_domains → feature_flags → app_config → legal_documents →
// admin"), filtered down to the tables that exist at this stage — states
// and practice_areas are seeded in the stage that adds those tables
// (2.1), not here.
//
// All upserts are idempotent: re-running this script must never create
// duplicates (docs/02_DATABASE.md §7.2).
//
// Stage 1.6 addition (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.6"):
// seedI18nTranslations() loads translations_seed.xlsx below and upserts
// i18n_keys/i18n_translations/i18n_bundle_versions through the same
// parse+validate path as POST /admin/i18n/import.
//
// Stage 1.8 addition (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.8"):
// seedAppConfig() seeds min_app_version_*/soft_update_version_* — the
// app_config table this stage's schema.prisma adds.
//
// Cost-guard addition (owner decision 2026-09-27, docs/OPEN_QUESTIONS.md):
// seedAppConfig() also seeds budget.<provider>.* caps and
// sms.allowed_country_codes.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildParsedWorkbook,
  parseTranslationsFile,
} from '../src/modules/i18n/xlsx/i18n-workbook.util';
import {
  flattenPracticeAreaSeed,
  PracticeAreaSeedCategory,
} from '../src/common/reference-data/practice-areas.util';
import { US_STATES } from '../src/common/reference-data/us-states';
import {
  FILE_03_SETTINGS,
  FILE_04_SETTINGS,
  FILE_05_SETTINGS,
} from '../src/common/app-settings/app-settings.defaults';

const prisma = new PrismaClient();

// docs/02_DATABASE.md §3.1 (stage 2.1): 50 states + DC, upsert by code.
async function seedStates(): Promise<void> {
  for (const state of US_STATES) {
    await prisma.state.upsert({
      where: { code: state.code },
      create: state,
      update: { name: state.name },
    });
  }
  console.log(`  states: ${US_STATES.length} upserted`);
}

// docs/02_DATABASE.md §3.2 (stage 2.1): categories first, then leaves,
// upsert by code so re-runs and later list edits never duplicate rows.
async function seedPracticeAreas(): Promise<void> {
  const seedPath = join(__dirname, 'seed', 'practice_areas.seed.json');
  const rows = flattenPracticeAreaSeed(
    JSON.parse(readFileSync(seedPath, 'utf-8')) as PracticeAreaSeedCategory[],
  );
  const idByCode = new Map<string, string>();
  for (const row of rows) {
    const parent_id =
      row.parent_code === null ? null : idByCode.get(row.parent_code);
    if (parent_id === undefined) {
      throw new Error(`practice_areas: parent ${row.parent_code} not seeded`);
    }
    const data = {
      parent_id,
      name_en: row.name_en,
      i18n_key: row.i18n_key,
      sort: row.sort,
    };
    const saved = await prisma.practiceArea.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
    idByCode.set(row.code, saved.id);
  }
  const leaves = rows.filter((r) => r.parent_code !== null).length;
  console.log(
    `  practice_areas: ${rows.length - leaves} categories + ${leaves} specializations upserted`,
  );
}

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
// docs/01_FOUNDATION_AUTH.md §15, "Этап 1.6": "Создать translations_seed
// .xlsx (en+ru) ... и загрузить seed-скриптом." Reuses the exact
// parse/validate logic the real POST /admin/i18n/import endpoint uses
// (src/modules/i18n/xlsx/i18n-workbook.util.ts) rather than a second,
// looser parser just for seeding — the seed file has to pass the same
// §9.3 validation (duplicate keys, required en, placeholder parity,
// known language columns) a real admin upload would.
//
// Idempotent by diffing against current DB state (not a bare upsert of
// everything every run): re-running this with an unchanged xlsx bumps
// nothing, matching this file's "never create duplicates" contract and
// keeping i18n_bundle_versions.version from incrementing on every seed
// run. No withTxRetry here (unlike I18nImportService's apply path) —
// this file doesn't use transactions anywhere else; a seed script runs
// once against a fresh/dev DB, not under the concurrent write load
// withTxRetry exists for.
async function seedI18nTranslations(): Promise<void> {
  const seedPath = join(__dirname, 'seed', 'translations_seed.xlsx');
  const buffer = readFileSync(seedPath);
  const grid = await parseTranslationsFile(buffer);
  const { workbook, errors } = buildParsedWorkbook(grid);
  if (errors.length > 0) {
    throw new Error(
      `translations_seed.xlsx failed validation:\n${errors
        .map((e) => `  ${JSON.stringify(e)}`)
        .join('\n')}`,
    );
  }

  const existingKeys = await prisma.i18nKey.findMany({
    where: { key: { in: workbook.rows.map((r) => r.key) } },
    include: { translations: true },
  });
  const existingByKey = new Map(existingKeys.map((k) => [k.key, k]));

  const changedKeys: { key: string; lang: string }[] = [];
  const affectedLangs = new Set<string>();
  for (const row of workbook.rows) {
    const existing = existingByKey.get(row.key);
    const existingValues = new Map(
      (existing?.translations ?? []).map((t) => [t.lang, t.value]),
    );
    for (const [lang, value] of Object.entries(row.values)) {
      if (existingValues.get(lang) !== value) {
        changedKeys.push({ key: row.key, lang });
        affectedLangs.add(lang);
      }
    }
  }

  if (changedKeys.length === 0) {
    console.log(
      `  i18n_translations: 0 changed (already up to date — ${workbook.rows.length} keys x ${workbook.languageCodes.length} langs)`,
    );
    return;
  }

  const versionByLang = new Map<string, number>();
  for (const lang of affectedLangs) {
    const bundleVersion = await prisma.i18nBundleVersion.findUnique({
      where: { lang },
    });
    versionByLang.set(lang, (bundleVersion?.version ?? 0) + 1);
  }

  const rowByKey = new Map(workbook.rows.map((r) => [r.key, r]));
  const keyIdByKey = new Map<string, string>();
  for (const key of new Set(changedKeys.map((c) => c.key))) {
    const keyRow = await prisma.i18nKey.upsert({
      where: { key },
      create: { key },
      update: {},
    });
    keyIdByKey.set(key, keyRow.id);
  }

  for (const { key, lang } of changedKeys) {
    const value = rowByKey.get(key)?.values[lang];
    const keyId = keyIdByKey.get(key);
    const version = versionByLang.get(lang);
    if (value === undefined || keyId === undefined || version === undefined) {
      throw new Error(
        `i18n seed: inconsistent state for key "${key}" lang "${lang}"`,
      );
    }
    await prisma.i18nTranslation.upsert({
      where: { key_id_lang: { key_id: keyId, lang } },
      create: { key_id: keyId, lang, value, version },
      update: { value, version },
    });
  }

  for (const [lang, version] of versionByLang) {
    await prisma.i18nBundleVersion.upsert({
      where: { lang },
      create: { lang, version },
      update: { version },
    });
  }

  console.log(
    `  i18n_translations: ${changedKeys.length} upserted across ${affectedLangs.size} language(s) (${workbook.rows.length} keys total)`,
  );
}

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
// GET /config/bootstrap) is the stage-1.8 work added alongside this
// function's app_config sibling below.
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
    {
      // docs/01 §10.6: App Attest / Play Integrity on otp/request and
      // social login. Keep OFF until real verifiers are configured —
      // the placeholder verifiers reject every token.
      key: 'device_attestation',
      enabled: false,
      description:
        'Require App Attest / Play Integrity on OTP request and social login',
    },
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

// docs/02_DATABASE.md §4.B: "app_config: key text PK, value jsonb,
// updated_at. Ключи: min_app_version_ios, min_app_version_android,
// soft_update_version_ios, soft_update_version_android." Seeded equal to
// the app's current version (`HeadersInterceptor.appVersion` on the
// Flutter side, `0.1.0`) so a freshly-seeded dev/CI database never forces
// an update on the very client that just built against it — an operator
// raises these from the admin panel (not built yet — file 6) when an
// actual minimum/soft-update version is decided.
async function seedAppConfig(): Promise<void> {
  const keys = [
    'min_app_version_ios',
    'min_app_version_android',
    'soft_update_version_ios',
    'soft_update_version_android',
  ];
  for (const key of keys) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: '0.1.0' },
      update: {},
    });
  }
  console.log(`  app_config: ${keys.length} upserted`);

  // docs/03_VERIFICATION_PROFILES.md §9 (stage 3.1). `update: {}` — a
  // value the owner changed in the admin panel is never overwritten.
  for (const [key, value] of Object.entries(FILE_03_SETTINGS)) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
  console.log(
    `  app_config (file 03 §9): ${Object.keys(FILE_03_SETTINGS).length} upserted`,
  );

  // docs/04_CASES_BIDS.md §14 (stage 4.1) and docs/05 §13–§14 (stage 5.1).
  // `update: {}` as above.
  for (const [key, value] of Object.entries({
    ...FILE_04_SETTINGS,
    ...FILE_05_SETTINGS,
  })) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }

  // Cost protection (owner-approved extension 2026-09-27 —
  // docs/OPEN_QUESTIONS.md, docs/COST_PROTECTION.md): live caps read by
  // CostGuardService and the SMS country allow-list read by OtpService.
  // Values mirror the env.schema.ts fallbacks. `update: {}` — re-seeding
  // never overwrites a cap the owner has since changed.
  const costKeys: Record<string, number | string[]> = {
    'budget.sms.per_minute_max': 30,
    'budget.sms.daily_max': 300,
    'budget.sms.monthly_max': 5000,
    'budget.email.per_minute_max': 100,
    'budget.email.daily_max': 2000,
    'budget.email.monthly_max': 30000,
    'budget.id_check.per_minute_max': 5,
    'budget.id_check.daily_max': 20,
    'budget.id_check.monthly_max': 200,
    'budget.storage.per_minute_max': 120,
    'budget.storage.daily_max': 5000,
    'budget.storage.monthly_max': 100000,
    'sms.allowed_country_codes': ['US'],
  };
  for (const [key, value] of Object.entries(costKeys)) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
  console.log(
    `  app_config (cost guard): ${Object.keys(costKeys).length} upserted`,
  );
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
  console.log('Seeding LawBid...');
  // Order per docs/02_DATABASE.md §7.2.
  await seedStates();
  await seedPracticeAreas();
  await seedI18nLanguages();
  await seedI18nTranslations();
  await seedBlockedEmailDomains();
  await seedFeatureFlags();
  await seedAppConfig();
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
