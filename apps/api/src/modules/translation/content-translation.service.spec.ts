import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import { ContentTranslationService } from './content-translation.service';
import type { TranslationService } from './translation.service';
import { zoneAllowed } from './translation-zones';

const client = { sub: 'c1', role: 'client' } as unknown as RequestUser;
const attorney = { sub: 'a1', role: 'attorney' } as unknown as RequestUser;

function setup(opts: { key?: string | null; caseAccess?: unknown } = {}) {
  const prisma = {
    post: { findFirst: jest.fn().mockResolvedValue({ body: ' Hello ' }) },
    comment: { findFirst: jest.fn().mockResolvedValue(null) },
    review: { findFirst: jest.fn().mockResolvedValue({ body: null }) },
    attorneyProfile: {
      findUnique: jest.fn().mockResolvedValue({ bio: 'Bio' }),
    },
    case: { findFirst: jest.fn().mockResolvedValue({ description: 'Desc' }) },
    bid: {
      findUnique: jest.fn().mockResolvedValue({
        message: 'Offer',
        attorney_id: 'a1',
        case: { client_id: 'c1' },
      }),
    },
  };
  const access = {
    decide: jest
      .fn()
      .mockResolvedValue(
        opts.caseAccess === undefined ? { kind: 'owner' } : opts.caseAccess,
      ),
  };
  const engine = {
    assertEntitled: jest.fn().mockResolvedValue(undefined),
    apiKey: jest
      .fn()
      .mockResolvedValue(opts.key === undefined ? 'k' : opts.key),
    translate: jest.fn(
      (
        _u: RequestUser,
        _z: string,
        _id: string,
        text: string,
        target: string,
      ) =>
        Promise.resolve({
          text: `[${text}]`,
          sourceLanguage: 'en',
          targetLanguage: target,
        }),
    ),
  };
  const service = new ContentTranslationService(
    prisma as unknown as PrismaService,
    access as unknown as CaseAccessPolicy,
    engine as unknown as TranslationService,
  );
  return { service, prisma, access, engine };
}

describe('ContentTranslationService', () => {
  it('translates a published post in the posts zone', async () => {
    const s = setup();
    await expect(
      s.service.translate(client, 'post', 'p1', 'ru'),
    ).resolves.toMatchObject({
      text: '[Hello]',
    });
    expect(s.engine.apiKey).toHaveBeenCalledWith('posts');
    expect(s.engine.translate).toHaveBeenCalledWith(
      client,
      'posts',
      'post:p1',
      'Hello',
      'ru',
    );
  });

  it('reads nothing when the zone is off', async () => {
    const s = setup({ key: null });
    await expect(
      s.service.translate(client, 'profile', 'a1', 'ru'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.TRANSLATION_UNAVAILABLE },
    });
    expect(s.prisma.attorneyProfile.findUnique).not.toHaveBeenCalled();
  });

  it('404s what is missing, empty or not visible', async () => {
    const s = setup({ caseAccess: null });
    for (const kind of ['comment', 'review', 'case'] as const) {
      await expect(
        s.service.translate(attorney, kind, 'x', 'ru'),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.NOT_FOUND },
      });
    }
    expect(s.prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it('a bid only for its two parties', async () => {
    const s = setup();
    await expect(
      s.service.translate(client, 'bid', 'b1', 'ru'),
    ).resolves.toMatchObject({ text: '[Offer]' });
    await expect(
      s.service.translate(attorney, 'bid', 'b1', 'ru'),
    ).resolves.toMatchObject({ text: '[Offer]' });
    const other = { sub: 'a2', role: 'attorney' } as unknown as RequestUser;
    await expect(
      s.service.translate(other, 'bid', 'b1', 'ru'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.NOT_FOUND },
    });
    expect(s.engine.apiKey).toHaveBeenCalledWith('cases');
  });
});

describe('zoneAllowed', () => {
  it('all zones by default; only switched-on ones with scope "zones"', () => {
    expect(zoneAllowed({}, 'posts')).toBe(true);
    expect(zoneAllowed({ 'translate.posts': false }, 'posts')).toBe(true);
    const zones = { 'translate.scope': 'zones', 'translate.posts': false };
    expect(zoneAllowed(zones, 'posts')).toBe(false);
    expect(zoneAllowed(zones, 'chat')).toBe(true);
  });
});
