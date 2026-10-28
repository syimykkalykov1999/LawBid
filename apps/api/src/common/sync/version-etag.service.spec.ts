import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { conditionalGet, etagMatches } from './cheap-etag';
import { VersionEtagService } from './version-etag.service';

const T = new Date('2026-10-25T10:00:00Z');

function make(rows: unknown[], sec = 60) {
  const queryRaw = jest.fn(() => Promise.resolve(rows));
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const settings = {
    number: jest.fn(() => Promise.resolve(sec)),
  } as unknown as AppSettingsService;
  return { svc: new VersionEtagService(prisma, settings), queryRaw };
}

const postRow = {
  updated_at: T,
  status: 'published',
  like_count: 1,
  comment_count: 2,
  save_count: 0,
  share_count: 0,
  view_count: 9,
  repost_count: 0,
  hide_likes: false,
  hide_views: false,
  author_updated_at: T,
  liked: false,
  reposted: false,
  saved: false,
  following: true,
};

describe('VersionEtagService', () => {
  afterEach(() => jest.useRealTimers());

  it('same stamps in the same bucket give the same tag; a stamp change moves it', async () => {
    const a = await make([postRow]).svc.post('u1', 'p1');
    const b = await make([postRow]).svc.post('u1', 'p1');
    expect(a).toBe(b);
    expect(a).toMatch(/^W\/"post-/);
    const liked = await make([{ ...postRow, liked: true }]).svc.post(
      'u1',
      'p1',
    );
    expect(liked).not.toBe(a);
    const counted = await make([{ ...postRow, like_count: 2 }]).svc.post(
      'u1',
      'p1',
    );
    expect(counted).not.toBe(a);
    // Owner 2026-10-28: hiding a counter is a new answer for others.
    const hidLikes = await make([{ ...postRow, hide_likes: true }]).svc.post(
      'u1',
      'p1',
    );
    expect(hidLikes).not.toBe(a);
    const hidViews = await make([{ ...postRow, hide_views: true }]).svc.post(
      'u1',
      'p1',
    );
    expect(hidViews).not.toBe(a);
    expect(hidViews).not.toBe(hidLikes);
  });

  it('the time bucket is the safety net', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-25T10:00:10Z'));
    const a = await make([postRow]).svc.post('u1', 'p1');
    jest.setSystemTime(new Date('2026-10-25T10:00:50Z'));
    expect(await make([postRow]).svc.post('u1', 'p1')).toBe(a);
    jest.setSystemTime(new Date('2026-10-25T10:01:10Z'));
    expect(await make([postRow]).svc.post('u1', 'p1')).not.toBe(a);
  });

  it('no tag for a missing post, a processing video, or when switched off', async () => {
    expect(await make([]).svc.post('u1', 'p1')).toBeNull();
    expect(
      await make([{ ...postRow, status: 'processing' }]).svc.post('u1', 'p1'),
    ).toBeNull();
    const off = make([postRow], 0);
    expect(await off.svc.post('u1', 'p1')).toBeNull();
    expect(off.queryRaw).not.toHaveBeenCalled();
    expect(await off.svc.notifications('u1')).toBeNull();
  });

  it('tags cases (view-specific), chats and notifications', async () => {
    const caseRow = {
      updated_at: T,
      status: 'open',
      bids_count: 1,
      comment_count: 0,
      share_count: 0,
      last_activity_at: T,
      paused_at: null,
      saved: false,
      bid_id: null,
      bid_status: null,
      bid_updated_at: null,
    };
    const att = await make([caseRow]).svc.caseDetail('u1', 'c1', 'attorney');
    const own = await make([caseRow]).svc.caseDetail('u1', 'c1', 'owner');
    expect(att).toMatch(/^W\/"case-attorney-/);
    expect(own).toMatch(/^W\/"case-owner-/);
    expect(
      await make([{ ...caseRow, bids_count: 2 }]).svc.caseDetail(
        'u1',
        'c1',
        'attorney',
      ),
    ).not.toBe(att);
    expect(await make([]).svc.caseDetail('u1', 'c1', 'owner')).toBeNull();

    const chats = await make([
      { newest: T, chats: 3, mine_updated: T },
    ]).svc.conversations('u1');
    expect(chats).toMatch(/^W\/"chats-/);
    const notifs = await make([{ newest: T, unread: 2 }]).svc.notifications(
      'u1',
    );
    expect(
      await make([{ newest: T, unread: 1 }]).svc.notifications('u1'),
    ).not.toBe(notifs);
  });
});

describe('conditionalGet', () => {
  const res = () => {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      status: jest.fn(),
    };
  };

  it('a matching If-None-Match is a 304: verify runs, build does not', async () => {
    const r = res();
    const verify = jest.fn(() => Promise.resolve());
    const build = jest.fn(() => Promise.resolve('body'));
    const out = await conditionalGet(
      { headers: { 'if-none-match': 'W/"x-1"' } },
      r as never,
      'W/"x-1"',
      verify,
      build,
    );
    expect(out).toBeUndefined();
    expect(verify).toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(304);
    expect(r.headers.ETag).toBe('W/"x-1"');
  });

  it('a failing verify (access lost) is an error, never a 304', async () => {
    const r = res();
    await expect(
      conditionalGet(
        { headers: { 'if-none-match': 'W/"x-1"' } },
        r as never,
        'W/"x-1"',
        () => Promise.reject(new Error('404')),
        () => Promise.resolve('body'),
      ),
    ).rejects.toThrow('404');
    expect(r.status).not.toHaveBeenCalled();
    expect(r.setHeader).not.toHaveBeenCalled();
  });

  it('a different tag builds the body and sets the new tag; null = untagged', async () => {
    const r = res();
    const out = await conditionalGet(
      { headers: { 'if-none-match': 'W/"old"' } },
      r as never,
      'W/"new"',
      () => Promise.resolve(),
      () => Promise.resolve('body'),
    );
    expect(out).toBe('body');
    expect(r.headers.ETag).toBe('W/"new"');
    const r2 = res();
    expect(
      await conditionalGet(
        { headers: {} },
        r2 as never,
        null,
        () => Promise.resolve(),
        () => Promise.resolve('b2'),
      ),
    ).toBe('b2');
    expect(r2.setHeader).not.toHaveBeenCalled();
    expect(etagMatches('W/"a"', 'W/"a"')).toBe(true);
  });
});
