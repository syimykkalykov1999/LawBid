import { AdminContentController } from './admin-content.controller';
import { AdminContentBulkService } from './admin-content-bulk.service';
import { AdminContentExtrasService } from './admin-content-extras.service';
import { AdminContentService } from './admin-content.service';

/**
 * Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on posts,
 * comments, reviews and reviews of clients sends the FILTER; the server
 * resolves the ids with exactly the list's where (no browser page walk).
 */
describe('content bulk by filter', () => {
  const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
  const staff = { id: 's', ip: null, adminRole: 'moderator' } as never;
  const AUTHOR = '00000000-0000-4000-8000-000000000001';
  const filter = {
    q: 'rent',
    authorId: AUTHOR,
    from: '2026-11-01T07:00:00.000Z',
    to: '2026-11-08T08:00:00.000Z',
  };

  /** One Prisma model whose findMany records every where it was given. */
  function model(n = 3) {
    return {
      findMany: jest.fn(
        (a: { take?: number; select?: { id: true } }): Promise<unknown[]> =>
          Promise.resolve(
            a.select && Object.keys(a.select).length === 1
              ? Array.from({ length: Math.min(n, a.take ?? n) }, (_, i) => ({
                  id: `id${i}`,
                }))
              : [],
          ),
      ),
    };
  }

  function build() {
    const prisma = {
      post: model(),
      comment: model(),
      caseComment: model(),
      review: model(),
      clientReview: model(),
      // the posts search: two matching ids
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const content = Object.create(
      AdminContentService.prototype,
    ) as AdminContentService;
    Object.assign(content, { prisma });
    const extras = Object.create(
      AdminContentExtrasService.prototype,
    ) as AdminContentExtrasService;
    Object.assign(extras, { prisma });
    const record = jest.fn().mockResolvedValue(undefined);
    const bulk = Object.create(
      AdminContentBulkService.prototype,
    ) as AdminContentBulkService;
    Object.assign(bulk, { prisma, extras, audit: { record } });
    const one = jest
      .spyOn(bulk as unknown as { one: () => Promise<void> }, 'one')
      .mockResolvedValue(undefined);
    const ctl = Object.create(
      AdminContentController.prototype,
    ) as AdminContentController;
    const settings = { number: jest.fn().mockResolvedValue(2) };
    Object.assign(ctl, { content, extras, bulk, settings, audit: { record } });
    return { prisma, content, extras, bulk, ctl, record, one, settings };
  }

  /** The where of the list call (no cursor) vs the where of the id read. */
  function wheres(m: { findMany: jest.Mock }) {
    const calls = m.findMany.mock.calls as [
      { where: unknown; select?: unknown },
    ][];
    const list = calls.find(([a]) => !a.select)?.[0].where;
    const ids = calls.find(([a]) => a.select)?.[0].where;
    return { list, ids };
  }

  /** A where with the list's empty keyset `{}` left out of its AND. */
  const noKeyset = (w: unknown) => {
    const o = w as { AND?: unknown[] };
    return o.AND
      ? {
          ...o,
          AND: o.AND.filter(
            (x) =>
              !(
                x &&
                typeof x === 'object' &&
                Object.keys(x).length === 0 &&
                o.AND!.indexOf(x) === o.AND!.length - 1
              ),
          ),
        }
      : o;
  };

  it('posts: the ids come from the very where of the posts list', async () => {
    const { prisma, content, bulk } = build();
    const f = { ...filter, kind: 'post' as const, media: 'video' as const };
    await content.posts(f.q, f.kind, undefined, true, f);
    await bulk.idsByFilter('post', f, null);
    const w = wheres(prisma.post);
    expect(w.ids).toEqual(noKeyset(w.list));
  });

  it('comments and case comments: the list where, per thread', async () => {
    const { prisma, content, bulk } = build();
    await content.comments('post', filter.q, undefined, filter);
    await bulk.idsByFilter('comment', filter, null);
    let w = wheres(prisma.comment);
    expect(w.ids).toEqual(w.list);
    await content.comments('case', filter.q, undefined, filter);
    await bulk.idsByFilter('case_comment', filter, null);
    w = wheres(prisma.caseComment);
    expect(w.ids).toEqual(w.list);
  });

  it('reviews and reviews of clients: the list where', async () => {
    const { prisma, content, extras, bulk } = build();
    await content.reviews(undefined, filter.q, filter);
    await bulk.idsByFilter('review', filter, null);
    let w = wheres(prisma.review);
    expect(w.ids).toEqual(noKeyset(w.list));
    await extras.clientReviews(filter.q, 'hidden', undefined, filter);
    await bulk.idsByFilter(
      'client_review',
      { ...filter, status: 'hidden' },
      null,
    );
    w = wheres(prisma.clientReview);
    expect(w.ids).toEqual(noKeyset(w.list));
  });

  it('POST /admin/content/bulk with a filter: staff capped by the setting, audited once, every id acted on', async () => {
    const { ctl, record, one, settings } = build();
    const out = await ctl.bulkAdminContent(staff, {
      action: 'hide',
      type: 'review',
      filter,
      reason: 'spam wave!!',
    } as never);
    expect(settings.number).toHaveBeenCalledWith('admin.bulk_select_cap');
    expect(out.done).toEqual(['id0', 'id1']);
    expect(one).toHaveBeenCalledTimes(2);
    const audits = record.mock.calls.map(([r]: [{ action: string }]) => r);
    expect(audits[0]).toMatchObject({
      action: 'admin.content.bulk_filter',
      targetType: 'review_filter',
      after: { action: 'hide', matched: 2, capped: true, processed: 2 },
    });
  });

  it('the owner acts on every match and more than the staff per-request cap', async () => {
    const { ctl, prisma, one } = build();
    prisma.post.findMany.mockImplementation(
      (a: { take?: number; select?: unknown; skip?: number }) =>
        Promise.resolve(
          a.select
            ? Array.from({ length: a.skip ? 101 : (a.take ?? 0) }, (_, i) => ({
                id: `${a.skip ? 'b' : 'a'}${i}`,
              }))
            : [],
        ),
    );
    const out = await ctl.bulkAdminContent(owner, {
      action: 'remove',
      type: 'post',
      filter: {},
      reason: 'spam wave!!',
    } as never);
    expect(out.done).toHaveLength(601);
    expect(one).toHaveBeenCalledTimes(601);
  });

  it('preview: how many, capped, the cap in force', async () => {
    const { ctl } = build();
    await expect(
      ctl.previewAdminContentBulk(staff, { type: 'comment', filter } as never),
    ).resolves.toEqual({ matched: 2, capped: true, cap: 2 });
    await expect(
      ctl.previewAdminContentBulk(owner, { type: 'comment', filter } as never),
    ).resolves.toEqual({ matched: 3, capped: false, cap: null });
  });

  it('classify by filter: the posts filter resolves the ids', async () => {
    const { ctl, content } = build();
    const classify = jest
      .spyOn(content, 'classifyPosts')
      .mockResolvedValue({ done: [], skipped: [] });
    await ctl.classifyAdminPosts(owner, {
      contentClass: 'legal',
      filter: { kind: 'news' },
    } as never);
    expect(classify).toHaveBeenCalledWith(['id0', 'id1', 'id2'], 'legal');
  });
});
