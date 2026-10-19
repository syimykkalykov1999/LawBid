import { I18nTextsService } from './i18n-texts.service';

describe('I18nTextsService (owner 2026-10-18, admin «Справочник»)', () => {
  function setup(opts: { key?: boolean; lang?: boolean } = {}) {
    const tx = {
      i18nKey: {
        findUnique: jest.fn(() =>
          Promise.resolve(opts.key === false ? null : { id: 'k1' }),
        ),
      },
      i18nLanguage: {
        findUnique: jest.fn(() =>
          Promise.resolve(opts.lang === false ? null : { code: 'ru' }),
        ),
      },
      i18nBundleVersion: {
        findUnique: jest.fn(() => Promise.resolve({ version: 41 })),
        upsert: jest.fn(() => Promise.resolve({})),
      },
      i18nTranslation: { upsert: jest.fn(() => Promise.resolve({})) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const bundle = { cacheVersion: jest.fn(() => Promise.resolve()) };
    const svc = new I18nTextsService(prisma as never, bundle as never);
    return { svc, tx, bundle };
  }

  it('saves the text as admin-edited with the next bundle version', async () => {
    const { svc, tx, bundle } = setup();
    await svc.update('guide.s1.title', 'ru', 'Что такое LawBid');
    expect(tx.i18nTranslation.upsert).toHaveBeenCalledWith({
      where: { key_id_lang: { key_id: 'k1', lang: 'ru' } },
      create: {
        key_id: 'k1',
        lang: 'ru',
        value: 'Что такое LawBid',
        version: 42,
        admin_edited: true,
      },
      update: { value: 'Что такое LawBid', version: 42, admin_edited: true },
    });
    expect(tx.i18nBundleVersion.upsert).toHaveBeenCalledWith({
      where: { lang: 'ru' },
      create: { lang: 'ru', version: 42 },
      update: { version: 42 },
    });
    expect(bundle.cacheVersion).toHaveBeenCalledWith('ru', 42);
  });

  it('refuses an unknown key or language', async () => {
    await expect(
      setup({ key: false }).svc.update('guide.x', 'ru', 'a'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      setup({ lang: false }).svc.update('guide.s1.title', 'xx', 'a'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
