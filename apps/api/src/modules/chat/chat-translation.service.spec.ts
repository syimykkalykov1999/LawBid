import type { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { SecretsService } from '../../common/secrets/secrets.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { AppConfigService } from '../feature-flags/services/app-config.service';
import {
  DAILY_TRANSLATIONS,
  TranslationService,
} from '../translation/translation.service';
import { ChatTranslationService } from './chat-translation.service';

const user = { sub: 'u1', role: 'client' } as unknown as RequestUser;

function setup(opts: {
  flag?: boolean;
  key?: string;
  message?: { body_display: string } | null;
  config?: Record<string, unknown>;
}) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    incr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
  };
  const prisma = {
    message: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.message === undefined ? { body_display: 'Hello' } : opts.message,
        ),
    },
  };
  const secrets = {
    get: jest
      .fn()
      .mockResolvedValue(
        opts.key === undefined
          ? { fields: { apiKey: 'AIza-test-key' } }
          : opts.key
            ? { fields: { apiKey: opts.key } }
            : null,
      ),
  };
  const flags = { isEnabled: jest.fn().mockResolvedValue(opts.flag ?? true) };
  const logger = { warn: jest.fn() };
  const appConfig = {
    getConfig: jest.fn().mockResolvedValue(opts.config ?? {}),
  };
  const costGuard = { consume: jest.fn().mockResolvedValue(undefined) };
  const engine = new TranslationService(
    secrets as unknown as SecretsService,
    flags as unknown as FeatureFlagsService,
    redis as never,
    logger as unknown as PinoLogger,
    appConfig as unknown as AppConfigService,
    undefined,
    costGuard as never,
  );
  const service = new ChatTranslationService(
    prisma as unknown as PrismaService,
    engine,
  );
  return { service, redis, store, prisma, costGuard };
}

function googleAnswers(text: string, source = 'en') {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          translations: [
            { translatedText: text, detectedSourceLanguage: source },
          ],
        },
      }),
      { status: 200 },
    ),
  );
}

afterEach(() => jest.restoreAllMocks());

describe('ChatTranslationService', () => {
  it('translates the displayed text and caches it', async () => {
    const s = setup({});
    const fetch = googleAnswers('Привет');
    const first = await s.service.translate(user, 'c1', 'm1', 'ru');
    const second = await s.service.translate(user, 'c1', 'm1', 'ru');
    expect(first).toEqual({
      text: 'Привет',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string) as {
      q: string;
      target: string;
    };
    expect(body).toMatchObject({ q: 'Hello', target: 'ru' });
    // Only the uncached call is metered.
    expect(s.costGuard.consume).toHaveBeenCalledTimes(1);
    expect(s.costGuard.consume).toHaveBeenCalledWith('translate');
  });

  it('does not call Google when the global translate budget is spent', async () => {
    const s = setup({});
    const fetch = googleAnswers('x');
    s.costGuard.consume.mockRejectedValue(new Error('budget'));
    await expect(s.service.translate(user, 'c1', 'm1', 'ru')).rejects.toThrow(
      'budget',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is unavailable while the flag, the zone or the key is off', async () => {
    for (const opts of [
      { flag: false },
      { key: '' },
      // Owner 2026-10-05: «только выбранные» with chats switched off.
      { config: { 'translate.scope': 'zones', 'translate.chat': false } },
    ]) {
      const s = setup(opts);
      await expect(
        s.service.translate(user, 'c1', 'm1', 'ru'),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.TRANSLATION_UNAVAILABLE },
      });
    }
  });

  it('404s a message that is not in the conversation', async () => {
    const s = setup({ message: null });
    await expect(
      s.service.translate(user, 'c1', 'm1', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
  });

  it('stops after the daily limit', async () => {
    const s = setup({});
    googleAnswers('x');
    s.store.set(
      `tr:quota:u1:${new Date().toISOString().slice(0, 10)}`,
      String(DAILY_TRANSLATIONS),
    );
    await expect(
      s.service.translate(user, 'c1', 'm2', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.RATE_LIMITED } });
  });

  it('turns a provider error into TRANSLATION_UNAVAILABLE', async () => {
    const s = setup({});
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(
      s.service.translate(user, 'c1', 'm1', 'ru'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.TRANSLATION_UNAVAILABLE },
    });
    // A failed call does not use up the person's daily quota.
    expect(s.redis.incr).not.toHaveBeenCalled();
  });
});
