import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { BlocksService } from '../blocks/blocks.service';
import type { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import type { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';
import { ContentTranslationService } from './content-translation.service';
import type { TranslationService } from './translation.service';
import { zoneAllowed } from './translation-zones';

const client = { sub: 'c1', role: 'client' } as unknown as RequestUser;
const attorney = { sub: 'a1', role: 'attorney' } as unknown as RequestUser;

function setup(
  opts: {
    key?: string | null;
    caseAccess?: unknown;
    aboutHidden?: boolean;
    blocked?: boolean;
  } = {},
) {
  const prisma = {
    post: { findFirst: jest.fn().mockResolvedValue({ body: ' Hello ' }) },
    comment: { findFirst: jest.fn().mockResolvedValue(null) },
    review: { findFirst: jest.fn().mockResolvedValue({ body: null }) },
    attorneyProfile: {
      findUnique: jest.fn().mockResolvedValue({ bio: 'Bio' }),
      findFirst: jest.fn().mockResolvedValue({ bio: 'Bio' }),
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
  // PS1: «кто видит О себе» and blocks, as the public profile applies them.
  const privacy = {
    visibleTo: jest.fn((_v: string, ids: string[]) =>
      Promise.resolve(new Set(opts.aboutHidden ? [] : ids)),
    ),
  };
  const blocks = {
    isBlockedEitherWay: jest.fn().mockResolvedValue(!!opts.blocked),
  };
  const service = new ContentTranslationService(
    prisma as unknown as PrismaService,
    access as unknown as CaseAccessPolicy,
    engine as unknown as TranslationService,
    privacy as unknown as PrivacySettingsService,
    blocks as unknown as BlocksService,
  );
  return { service, prisma, access, engine, privacy, blocks };
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
    expect(s.prisma.attorneyProfile.findFirst).not.toHaveBeenCalled();
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

describe('ContentTranslationService visibility (verify 17.11 T1/T2)', () => {
  type Where = Record<string, unknown> & {
    archived_at?: unknown;
    author?: { status?: string };
    post?: { archived_at?: unknown; author?: { status?: string } };
    verification_status?: { not?: string };
    user?: { status?: string; role?: string; deleted_at?: unknown };
  };
  // A tiny stand-in for the DB: the row exists but is hidden (archived post,
  // suspended author, suspended attorney). It is returned only when the
  // query does not ask for the visibility rule — exactly the old bug.
  const hiddenPost = (where: Where) =>
    where.archived_at === null && where.author?.status === 'active'
      ? null
      : { body: 'Hidden' };
  const hiddenComment = (where: Where) =>
    where.post?.archived_at === null && where.post?.author?.status === 'active'
      ? null
      : { body: 'Hidden' };
  const suspendedBio = (where: Where) =>
    where.verification_status?.not === 'suspended' &&
    where.user?.status === 'active' &&
    where.user?.role === 'attorney' &&
    where.user?.deleted_at === null
      ? null
      : { bio: 'Hidden' };

  it('404s an archived post / post of a suspended author', async () => {
    const s = setup();
    s.prisma.post.findFirst.mockImplementation((a: { where: Where }) =>
      Promise.resolve(hiddenPost(a.where)),
    );
    await expect(
      s.service.translate(client, 'post', 'p1', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
  });

  it('404s a comment under a hidden post', async () => {
    const s = setup();
    s.prisma.comment.findFirst.mockImplementation((a: { where: Where }) =>
      Promise.resolve(hiddenComment(a.where)),
    );
    await expect(
      s.service.translate(client, 'comment', 'c1', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
  });

  it('404s the bio of a suspended / inactive attorney', async () => {
    const s = setup();
    s.prisma.attorneyProfile.findUnique.mockResolvedValue({ bio: 'Hidden' });
    s.prisma.attorneyProfile.findFirst.mockImplementation(
      (a: { where: Where }) => Promise.resolve(suspendedBio(a.where)),
    );
    await expect(
      s.service.translate(client, 'profile', 'a1', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
  });
});

describe('ContentTranslationService: the bio follows «О себе» and blocks (PS1)', () => {
  it('404s a bio hidden from this viewer by «кто видит О себе»', async () => {
    const s = setup({ aboutHidden: true });
    await expect(
      s.service.translate(client, 'profile', 'a1', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
    expect(s.privacy.visibleTo).toHaveBeenCalledWith(
      client.sub,
      ['a1'],
      'about_from',
    );
    expect(s.engine.translate).not.toHaveBeenCalled();
  });

  it('404s a bio when the two block each other (either way)', async () => {
    const s = setup({ blocked: true });
    await expect(
      s.service.translate(client, 'profile', 'a1', 'ru'),
    ).rejects.toMatchObject({ response: { code: ErrorCode.NOT_FOUND } });
    expect(s.blocks.isBlockedEitherWay).toHaveBeenCalledWith(client.sub, 'a1');
    expect(s.engine.translate).not.toHaveBeenCalled();
  });

  it('the owner always translates their own bio', async () => {
    const s = setup({ aboutHidden: true, blocked: true });
    const self = { ...attorney, sub: 'a1' };
    await expect(
      s.service.translate(self, 'profile', 'a1', 'ru'),
    ).resolves.toMatchObject({ text: '[Bio]' });
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
