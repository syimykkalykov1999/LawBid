import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { buildTranslationsWorkbookBuffer } from '../src/modules/i18n/xlsx/i18n-workbook.util';
import { adminSession } from './support/admin-login';

jest.setTimeout(120_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
}

/**
 * docs/06 stage 6.6 acceptance: a flag change applies without a release;
 * a paid flag can't be enabled without provider keys; an xlsx import with
 * a new language column adds the language; a new ToS version requires
 * acceptance at the next sign-in.
 */
describe('stage 6.6 — flags, config, localization, legal documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let settings: AppSettingsService;
  let baseUrl = '';
  const api = () => request(baseUrl);
  let phoneSeq = 1000 + Math.floor(Math.random() * 8000);
  const nextPhone = () => `+1202597${phoneSeq++}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port.port}`;
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    settings = app.get(AppSettingsService);
    // The e2e database is migrated, not seeded: the rows the panel edits
    // are created here the way prisma/seed.ts does.
    for (const f of [
      {
        key: 'persona_verification',
        enabled: false,
        description: 'Persona identity checks (paid)',
      },
      { key: 'apple_login', enabled: true, description: 'Sign in with Apple' },
    ]) {
      await prisma.featureFlag.upsert({
        where: { key: f.key },
        create: { ...f, rollout_percent: 100 },
        update: { enabled: f.enabled },
      });
    }
    for (const docType of ['terms', 'privacy', 'disclaimer'] as const) {
      await prisma.legalDocument.upsert({
        where: {
          doc_type_version_locale: {
            doc_type: docType,
            version: '1.0',
            locale: 'en',
          },
        },
        create: {
          doc_type: docType,
          version: '1.0',
          locale: 'en',
          content_md: `# ${docType}`,
          published_at: new Date(),
          is_current: true,
        },
        update: {},
      });
      // Exactly one current version per type/locale for this suite.
      await prisma.legalDocument.updateMany({
        where: { doc_type: docType, locale: 'en', NOT: { version: '1.0' } },
        data: { is_current: false },
      });
      await prisma.legalDocument.updateMany({
        where: { doc_type: docType, locale: 'en', version: '1.0' },
        data: { is_current: true },
      });
    }
    await redis.del(
      'config:flags',
      'config:app_config',
      'config:bootstrap:content',
    );
  });

  afterAll(async () => {
    // Leave no test language behind (other suites count languages).
    await prisma.i18nTranslation.deleteMany({ where: { lang: 'zx' } });
    await prisma.i18nBundleVersion.deleteMany({ where: { lang: 'zx' } });
    await prisma.i18nLanguage.deleteMany({ where: { code: 'zx' } });
    await prisma.featureFlag.updateMany({
      where: { key: 'apple_login' },
      data: { enabled: true },
    });
    await prisma.appConfig.upsert({
      where: { key: 'review.edit_window_days' },
      create: { key: 'review.edit_window_days', value: 14 },
      update: { value: 14 },
    });
    await redis.del(
      'config:flags',
      'config:app_config',
      'config:bootstrap:content',
    );
    await app.close();
  });

  it('flags: list shows paid flags with missing keys; toggling applies to /config/bootstrap at once; paid flag without keys → 409', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const finance = await adminSession(baseUrl, prisma, 'finance');
    await api()
      .get('/api/v1/admin/feature-flags')
      .set(finance.auth)
      .expect(403);

    const list = await api()
      .get('/api/v1/admin/feature-flags')
      .set(sup.auth)
      .expect(200);
    const flags = (list.body as { data: Array<Record<string, unknown>> }).data;
    const persona = flags.find((f) => f.key === 'persona_verification');
    expect(persona).toMatchObject({
      paid: true,
      requiredKeys: ['PERSONA_API_KEY'],
      missingKeys: ['PERSONA_API_KEY'],
    });
    expect(flags.find((f) => f.key === 'apple_login')).toMatchObject({
      paid: false,
      missingKeys: [],
    });

    const denied = await api()
      .patch('/api/v1/admin/feature-flags/persona_verification')
      .set(sup.auth)
      .send({ enabled: true })
      .expect(409);
    expect((denied.body as Body).error).toMatchObject({
      code: 'FLAG_PROVIDER_KEYS_MISSING',
      details: { missingKeys: ['PERSONA_API_KEY'] },
    });
    // Rollout percent alone is fine even for a paid flag.
    await api()
      .patch('/api/v1/admin/feature-flags/persona_verification')
      .set(sup.auth)
      .send({ rolloutPercent: 10 })
      .expect(200);

    // Warm the public cache, then flip a free flag: the next bootstrap sees it.
    const before = await api().get('/api/v1/config/bootstrap').expect(200);
    expect(
      (before.body as { data: { flags: Record<string, boolean> } }).data.flags
        .apple_login,
    ).toBe(true);
    await api()
      .patch('/api/v1/admin/feature-flags/apple_login')
      .set(sup.auth)
      .send({ enabled: false })
      .expect(200);
    const after = await api().get('/api/v1/config/bootstrap').expect(200);
    expect(
      (after.body as { data: { flags: Record<string, boolean> } }).data.flags
        .apple_login,
    ).toBe(false);
    await api()
      .patch('/api/v1/admin/feature-flags/nope_flag')
      .set(sup.auth)
      .send({ enabled: true })
      .expect(404);

    const audit = await prisma.auditLog.findMany({
      where: { admin_id: sup.userId, action: 'config.flag' },
      orderBy: { created_at: 'asc' },
    });
    expect(audit.length).toBe(2);
    expect(audit[1]).toMatchObject({
      before: { key: 'apple_login', enabled: true },
      after: { key: 'apple_login', enabled: false },
    });
  });

  it('app_config editor: schema list, validation, immediate effect on AppSettingsService', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    const list = await api()
      .get('/api/v1/admin/config')
      .set(sup.auth)
      .expect(200);
    const entries = (list.body as { data: Array<Record<string, unknown>> })
      .data;
    const edit = entries.find((e) => e.key === 'review.edit_window_days');
    expect(edit).toMatchObject({ type: 'integer', defaultValue: 14, min: 0 });
    expect(
      entries.find((e) => e.key === 'sms.allowed_country_codes'),
    ).toMatchObject({ type: 'string[]' });
    expect(
      entries.find((e) => e.key === 'moderation.blocked_terms'),
    ).toMatchObject({ type: 'string[]' });

    const wrongType = await api()
      .put('/api/v1/admin/config/review.edit_window_days')
      .set(sup.auth)
      .send({ value: 'ten' })
      .expect(400);
    expect((wrongType.body as Body).error?.code).toBe('VALIDATION_ERROR');
    await api()
      .put('/api/v1/admin/config/review.edit_window_days')
      .set(sup.auth)
      .send({ value: -1 })
      .expect(400);
    await api()
      .put('/api/v1/admin/config/not.a.key')
      .set(sup.auth)
      .send({ value: 1 })
      .expect(400);
    await api()
      .put('/api/v1/admin/config/sms.allowed_country_codes')
      .set(sup.auth)
      .send({ value: ['usa'] })
      .expect(400);

    await api()
      .put('/api/v1/admin/config/review.edit_window_days')
      .set(sup.auth)
      .send({ value: 21 })
      .expect(200);
    expect(await settings.number('review.edit_window_days')).toBe(21);
    const audit = await prisma.auditLog.findFirst({
      where: { admin_id: sup.userId, action: 'config.app_config' },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).toMatchObject({
      before: { key: 'review.edit_window_days' },
      after: { key: 'review.edit_window_days', value: 21 },
    });
  });

  it('localization: an xlsx with a new language column adds the language; languages can be switched off (not en)', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    // A 2-letter ISO 639-1 shaped code that no seed uses (the parser only
    // accepts [a-z]{2}); cleaned up from a previous run first.
    const code = 'zx';
    await prisma.i18nTranslation.deleteMany({ where: { lang: code } });
    await prisma.i18nBundleVersion.deleteMany({ where: { lang: code } });
    await prisma.i18nLanguage.deleteMany({ where: { code } });
    const key = `e2e.stage66.${randomUUID().slice(0, 8)}`;
    const buffer = await buildTranslationsWorkbookBuffer(
      ['en', code],
      [{ key, values: { en: 'Hello', [code]: 'Salut' } }],
    );
    const dry = await api()
      .post('/api/v1/admin/i18n/import?mode=dry-run')
      .set(sup.auth)
      .attach('file', buffer, 'translations.xlsx')
      .expect(201);
    expect((dry.body as Body).data).toMatchObject({
      applied: false,
      newLanguages: expect.arrayContaining([code]),
    });
    expect(
      await prisma.i18nLanguage.findUnique({ where: { code } }),
    ).toBeNull();
    const applied = await api()
      .post('/api/v1/admin/i18n/import?mode=apply')
      .set(sup.auth)
      .attach('file', buffer, 'translations.xlsx')
      .expect(201);
    expect((applied.body as Body).data).toMatchObject({
      applied: true,
      newLanguages: expect.arrayContaining([code]),
    });
    expect(
      await prisma.i18nLanguage.findUnique({ where: { code } }),
    ).toMatchObject({ is_active: true });
    const boot = await api().get('/api/v1/config/bootstrap').expect(200);
    expect(
      (
        boot.body as { data: { languages: Array<{ code: string }> } }
      ).data.languages.map((l) => l.code),
    ).toContain(code);

    const langs = await api()
      .get('/api/v1/admin/i18n/languages')
      .set(sup.auth)
      .expect(200);
    expect(
      (
        langs.body as { data: Array<{ code: string; translations: number }> }
      ).data.find((l) => l.code === code),
    ).toMatchObject({ translations: 1 });
    await api()
      .patch(`/api/v1/admin/i18n/languages/${code}`)
      .set(sup.auth)
      .send({ isActive: false })
      .expect(200);
    const boot2 = await api().get('/api/v1/config/bootstrap').expect(200);
    expect(
      (
        boot2.body as { data: { languages: Array<{ code: string }> } }
      ).data.languages.map((l) => l.code),
    ).not.toContain(code);
    await api()
      .patch('/api/v1/admin/i18n/languages/en')
      .set(sup.auth)
      .send({ isActive: false })
      .expect(409);
  });

  it('legal documents: publishing a new terms version puts consents back into missing until re-accepted', async () => {
    const sup = await adminSession(baseUrl, prisma, 'super_admin');
    // A user who accepted the current documents.
    const phone = nextPhone();
    await api()
      .post('/api/v1/auth/otp/request')
      .send({ channel: 'phone', identifier: phone })
      .expect(200);
    const login = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: phone,
        code: '000000',
        deviceInfo: { deviceId: 'legal-e2e' },
      })
      .expect(201);
    const auth = {
      Authorization: `Bearer ${(login.body as { data: { accessToken: string } }).data.accessToken}`,
    };
    const boot = await api().get('/api/v1/config/bootstrap').expect(200);
    const docs = (
      boot.body as {
        data: {
          legal_documents: Array<{
            id: string;
            doc_type: string;
            version: string;
          }>;
        };
      }
    ).data.legal_documents;
    const idOf = (t: string) => docs.find((d) => d.doc_type === t)!.id;
    const accept = (ids: Record<string, string>) =>
      api()
        .post('/api/v1/users/me/consents')
        .set(auth)
        .send({
          consents: [
            { type: 'age_18', granted: true },
            { type: 'terms', granted: true, documentId: ids.terms },
            { type: 'privacy', granted: true, documentId: ids.privacy },
            { type: 'disclaimer', granted: true, documentId: ids.disclaimer },
          ],
        });
    await accept({
      terms: idOf('terms'),
      privacy: idOf('privacy'),
      disclaimer: idOf('disclaimer'),
    }).expect(201);
    const me1 = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect((me1.body as Body).data.requiredConsentsGranted).toBe(true);

    // New ToS version: draft → publish.
    const version = `9.${Date.now() % 100000}`;
    const draft = await api()
      .post('/api/v1/admin/legal-documents')
      .set(sup.auth)
      .send({
        docType: 'terms',
        locale: 'en',
        version,
        contentMd: '# Terms\n\nUpdated wording.',
      })
      .expect(201);
    const draftId = (draft.body as Body).data.id as string;
    expect((draft.body as Body).data).toMatchObject({
      isCurrent: false,
      publishedAt: null,
    });
    const me2 = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect((me2.body as Body).data.requiredConsentsGranted).toBe(true); // drafts don't count
    await api()
      .post(`/api/v1/admin/legal-documents/${draftId}/publish`)
      .set(sup.auth)
      .expect(200);
    await api()
      .post(`/api/v1/admin/legal-documents/${draftId}/publish`)
      .set(sup.auth)
      .expect(409);

    const me3 = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect((me3.body as Body).data.requiredConsentsGranted).toBe(false);
    expect((me3.body as Body).data.missing).toContain('consents');
    const boot2 = await api().get('/api/v1/config/bootstrap').expect(200);
    const terms2 = (
      boot2.body as {
        data: {
          legal_documents: Array<{
            id: string;
            doc_type: string;
            version: string;
          }>;
        };
      }
    ).data.legal_documents.find((d) => d.doc_type === 'terms')!;
    expect(terms2).toMatchObject({ id: draftId, version });
    await accept({
      terms: draftId,
      privacy: idOf('privacy'),
      disclaimer: idOf('disclaimer'),
    }).expect(201);
    const me4 = await api().get('/api/v1/users/me').set(auth).expect(200);
    expect((me4.body as Body).data.requiredConsentsGranted).toBe(true);

    const list = await api()
      .get('/api/v1/admin/legal-documents')
      .set(sup.auth)
      .expect(200);
    const rows = (
      list.body as { data: Array<Record<string, unknown>> }
    ).data.filter((d) => d.docType === 'terms' && d.locale === 'en');
    expect(rows.filter((d) => d.isCurrent).map((d) => d.id)).toEqual([draftId]);
    expect(rows.find((d) => d.id === draftId)).toMatchObject({ consents: 1 });
    const audit = await prisma.auditLog.findMany({
      where: { admin_id: sup.userId, action: { startsWith: 'legal.' } },
      orderBy: { created_at: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'legal.create',
      'legal.publish',
    ]);
  });
});
