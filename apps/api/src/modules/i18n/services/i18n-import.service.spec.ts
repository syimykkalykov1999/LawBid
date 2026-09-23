import { BadRequestException } from '@nestjs/common';
import { I18nImportService } from './i18n-import.service';
import type { I18nBundleService } from './i18n-bundle.service';

interface FakeKeyRow {
  id: string;
  key: string;
  translations: { lang: string; value: string }[];
}

/** Minimal stateful fake covering exactly the Prisma surface
 * I18nImportService touches — a real in-memory model of i18n_keys/i18n_
 * translations/i18n_bundle_versions/i18n_languages, not a mock-per-call
 * list, so the diff-against-DB and version-bump logic can be asserted
 * against realistic before/after state. A plain factory function
 * returning an object literal (same shape as identity.service.spec.ts's
 * buildFakePrisma), not a class — a class's methods trip
 * @typescript-eslint/unbound-method when later passed bare to
 * `expect(...)` in these tests. `$transaction` just invokes the callback
 * with the same fake as `tx` (no real isolation, matching how tx-retry
 * .util.spec.ts fakes it) since these tests exercise I18nImportService's
 * own logic, not withTxRetry's retry behavior. */
function buildFakePrisma(
  languages: { code: string; sort: number }[] = [
    { code: 'en', sort: 0 },
    { code: 'ru', sort: 1 },
  ],
) {
  const keysByKey = new Map<string, FakeKeyRow>();
  const bundleVersions = new Map<string, number>();
  let nextId = 1;

  const fake = {
    languages,
    keysByKey,
    bundleVersions,
    i18nLanguage: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(languages)),
      create: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: { code: string; sort: number } }) => {
            languages.push({ code: data.code, sort: data.sort });
            return Promise.resolve(data);
          },
        ),
    },
    i18nKey: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { key: { in: string[] } } }) => {
            const rows = where.key.in
              .map((k) => keysByKey.get(k))
              .filter((r): r is FakeKeyRow => r !== undefined);
            return Promise.resolve(rows);
          },
        ),
      upsert: jest
        .fn()
        .mockImplementation(({ where }: { where: { key: string } }) => {
          let row = keysByKey.get(where.key);
          if (!row) {
            row = { id: `key-${nextId++}`, key: where.key, translations: [] };
            keysByKey.set(where.key, row);
          }
          return Promise.resolve(row);
        }),
    },
    i18nTranslation: {
      upsert: jest.fn().mockImplementation(
        ({
          create,
        }: {
          create: {
            key_id: string;
            lang: string;
            value: string;
            version: number;
          };
        }) => {
          const row = [...keysByKey.values()].find(
            (k) => k.id === create.key_id,
          );
          if (!row) throw new Error('unknown key_id in fake');
          const existing = row.translations.find((t) => t.lang === create.lang);
          if (existing) existing.value = create.value;
          else
            row.translations.push({ lang: create.lang, value: create.value });
          return Promise.resolve(create);
        },
      ),
    },
    i18nBundleVersion: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { lang: string } }) => {
          const version = bundleVersions.get(where.lang);
          return Promise.resolve(
            version === undefined ? null : { lang: where.lang, version },
          );
        }),
      upsert: jest
        .fn()
        .mockImplementation(
          ({ create }: { create: { lang: string; version: number } }) => {
            bundleVersions.set(create.lang, create.version);
            return Promise.resolve(create);
          },
        ),
    },
    $transaction: jest.fn(),
  };
  fake.$transaction.mockImplementation(
    (fn: (tx: typeof fake) => Promise<void>) => fn(fake),
  );
  return fake;
}

/** Typed as its own plain literal (NOT intersected with the real
 * I18nBundleService), so `bundle.cacheVersion` below stays a plain
 * jest.Mock reference for `expect(...)` rather than resolving to
 * I18nBundleService's real (`this`-bound) method type, which is what
 * trips @typescript-eslint/unbound-method. Cast to I18nBundleService
 * only at the one call site that needs it (constructing the service
 * under test). */
function buildFakeBundle() {
  return { cacheVersion: jest.fn().mockResolvedValue(undefined) };
}

const csv = (text: string): Buffer => Buffer.from(text, 'utf-8');

describe('I18nImportService.run — dry-run', () => {
  it('reports new keys and does not write anything', async () => {
    const prisma = buildFakePrisma();
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    const report = await service.run(
      csv('key,en,ru\ncommon.cancel,Cancel,Отмена\n'),
      'dry-run',
    );

    expect(report.valid).toBe(true);
    expect(report.applied).toBe(false);
    expect(report.newKeys).toEqual(['common.cancel']);
    expect(report.changedKeys).toEqual([
      { key: 'common.cancel', lang: 'en' },
      { key: 'common.cancel', lang: 'ru' },
    ]);
    expect(prisma.i18nKey.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(bundle.cacheVersion).not.toHaveBeenCalled();
  });

  it('reports validation errors without throwing and without writing', async () => {
    const prisma = buildFakePrisma();
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    const report = await service.run(
      csv('key,en,ru\ncommon.cancel,,Отмена\n'),
      'dry-run',
    );

    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(prisma.i18nLanguage.findMany).not.toHaveBeenCalled();
  });

  it('separates changed values from unchanged ones against existing DB state', async () => {
    const prisma = buildFakePrisma();
    // Seed one existing key/translation matching what the file will send.
    prisma.keysByKey.set('common.cancel', {
      id: 'key-1',
      key: 'common.cancel',
      translations: [{ lang: 'en', value: 'Cancel' }],
    });
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    const report = await service.run(
      csv('key,en\ncommon.cancel,Cancel\n'), // same value as already in DB
      'dry-run',
    );

    expect(report.newKeys).toEqual([]);
    expect(report.changedKeys).toEqual([]);
    expect(report.unchangedCount).toBe(1);
  });
});

describe('I18nImportService.run — apply', () => {
  it('throws I18N_IMPORT_INVALID and writes nothing when validation fails', async () => {
    const prisma = buildFakePrisma();
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    await expect(
      service.run(csv('key,en\ncommon.cancel,\n'), 'apply'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a new key, versions it at bundleVersion+1 per affected language, and updates the Redis cache', async () => {
    const prisma = buildFakePrisma();
    prisma.bundleVersions.set('en', 4);
    prisma.bundleVersions.set('ru', 4);
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    const report = await service.run(
      csv('key,en,ru\ncommon.cancel,Cancel,Отмена\n'),
      'apply',
    );

    expect(report.applied).toBe(true);
    const keyRow = prisma.keysByKey.get('common.cancel');
    expect(keyRow?.translations).toEqual(
      expect.arrayContaining([
        { lang: 'en', value: 'Cancel' },
        { lang: 'ru', value: 'Отмена' },
      ]),
    );
    expect(prisma.bundleVersions.get('en')).toBe(5);
    expect(prisma.bundleVersions.get('ru')).toBe(5);
    expect(bundle.cacheVersion).toHaveBeenCalledWith('en', 5);
    expect(bundle.cacheVersion).toHaveBeenCalledWith('ru', 5);
  });

  it('auto-creates a new language row for a column not yet in i18n_languages (stage-1.6 acceptance criterion)', async () => {
    const prisma = buildFakePrisma(); // only en/ru exist
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    const report = await service.run(
      csv('key,en,ru,es\ncommon.cancel,Cancel,Отмена,Cancelar\n'),
      'apply',
    );

    expect(report.newLanguages).toEqual(['es']);
    expect(prisma.languages.find((l) => l.code === 'es')).toBeDefined();
    expect(prisma.i18nLanguage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'es', is_active: true }),
    });
  });

  it('does not touch a language whose value did not change, even when another language in the same row did', async () => {
    const prisma = buildFakePrisma();
    prisma.keysByKey.set('common.cancel', {
      id: 'key-1',
      key: 'common.cancel',
      translations: [
        { lang: 'en', value: 'Cancel' },
        { lang: 'ru', value: 'Отмена' },
      ],
    });
    prisma.bundleVersions.set('en', 1);
    prisma.bundleVersions.set('ru', 1);
    const bundle = buildFakeBundle();
    const service = new I18nImportService(
      prisma as never,
      bundle as unknown as I18nBundleService,
    );

    // en unchanged, ru changed
    await service.run(
      csv('key,en,ru\ncommon.cancel,Cancel,Отменить\n'),
      'apply',
    );

    expect(prisma.bundleVersions.get('en')).toBe(1); // untouched
    expect(prisma.bundleVersions.get('ru')).toBe(2);
    expect(bundle.cacheVersion).toHaveBeenCalledWith('ru', 2);
    expect(bundle.cacheVersion).not.toHaveBeenCalledWith(
      'en',
      expect.anything(),
    );
  });
});
