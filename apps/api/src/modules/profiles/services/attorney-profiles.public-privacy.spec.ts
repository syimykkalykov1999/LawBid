/* eslint-disable @typescript-eslint/require-await -- hand-made fakes */
import { viewerContext } from '../../../common/viewer/viewer-context';
import { AttorneyProfilesService } from './attorney-profiles.service';

/**
 * Verify batch 7 (2026-11-17), the public attorney profile and «who sees my
 * photo / about»:
 * PR1 the cached body is the same for everyone: the first viewer's photo
 *     rule (a stranger the owner hides the photo from) is never cached for
 *     the next viewer; the per-viewer mask is applied after the cache.
 * PS2 a privacy change gives a new ETag at once (its row's updated_at is in
 *     the cheap tag), not only after the 10-minute bucket.
 */
describe('AttorneyProfilesService public profile and privacy', () => {
  const stamp = new Date('2026-10-01T00:00:00Z');
  const row = {
    user_id: 'a',
    username: 'Saul',
    bio: 'bio',
    firm_name: null,
    firm_names: [],
    languages: ['en'],
    verification_status: 'verified',
    trust_level: 2,
    trust_badge: true,
    rating_avg: '4.50',
    rating_count: 2,
    posts_count: 1,
    followers_count: 3,
    following_count: 4,
    updated_at: stamp,
    user: {
      role: 'attorney',
      status: 'active',
      deleted_at: null,
      first_name: 'Saul',
      last_name: 'Goodman',
      avatar_file_id: 'f1',
      updated_at: stamp,
    },
    licenses: [],
  };

  function make(queryRows: unknown[][] = []) {
    const raw = [...queryRows];
    const sql: string[] = [];
    const prisma = {
      attorneyProfile: { findUnique: jest.fn(async () => row) },
      follow: { findUnique: jest.fn(async () => null) },
      firmMember: { findFirst: jest.fn(async () => null) },
      legalAnswer: { count: jest.fn(async () => 0) },
      $queryRaw: jest.fn(async (s: TemplateStringsArray) => {
        sql.push(s.join('?'));
        return raw.shift() ?? [];
      }),
    };
    // FilesService hides the photo from a viewer the owner keeps it from
    // (it reads the request's viewer, as the real one does).
    const files = {
      avatarUrls: jest.fn(async () =>
        viewerContext.viewerId() === 'stranger'
          ? { url: null, url256: null }
          : { url: 'http://signed/a', url256: 'http://signed/a_w256' },
      ),
    };
    const privacy = {
      visibleTo: jest.fn(
        async (viewer: string, ids: string[], field: string) =>
          new Set(field === 'photo_from' && viewer === 'stranger' ? [] : ids),
      ),
    };
    const kv = new Map<string, string>();
    const cache = {
      get: jest.fn(async (k: string) => kv.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        kv.set(k, v);
        return 'OK';
      }),
      del: jest.fn(async () => 1),
    };
    const svc = new AttorneyProfilesService(
      prisma as never,
      { number: jest.fn(async () => 60) } as never,
      { selectedOf: jest.fn(async () => []) } as never,
      files as never,
      { pending: jest.fn(async () => new Map()) } as never,
      {} as never,
      {
        relation: async () => ({ isBlocked: false, hasBlockedMe: false }),
      } as never,
      privacy as never,
      undefined,
      undefined,
      undefined,
      undefined,
      cache as never,
    );
    return { svc, sql, files };
  }

  it('PR1: a hidden photo for the first viewer is not cached for the next one', async () => {
    const { svc } = make();
    const first = await viewerContext.run('stranger', () =>
      svc.getPublic('saul', 'stranger'),
    );
    expect(first.avatarUrl).toBeNull();
    const second = await viewerContext.run('friend', () =>
      svc.getPublic('saul', 'friend'),
    );
    expect(second.avatarUrl).toBe('http://signed/a');
    expect(second.avatarUrl256).toBe('http://signed/a_w256');
    // And the stranger still gets no photo from the shared body.
    const third = await viewerContext.run('stranger', () =>
      svc.getPublic('saul', 'stranger'),
    );
    expect(third.avatarUrl).toBeNull();
  });

  it('PS2: a privacy change moves the ETag of the public profile', async () => {
    const base = {
      user_id: 'a',
      updated_at: stamp,
      user_updated_at: stamp,
      posts_count: 1,
      followers_count: 3,
      rating_count: 2,
      verification_status: 'verified',
      trust_level: '2',
    };
    const at = 1_800_000_000_000;
    const { svc, sql } = make([
      [{ ...base, privacy_updated_at: new Date('2026-11-01T00:00:00Z') }],
      [{ following: false }],
      [{ ...base, privacy_updated_at: new Date('2026-11-02T00:00:00Z') }],
      [{ following: false }],
    ]);
    const before = await svc.publicEtag('saul', 'v', at);
    const after = await svc.publicEtag('saul', 'v', at);
    expect(sql[0]).toContain('user_privacy_settings');
    expect(after).not.toBe(before);
  });
});
