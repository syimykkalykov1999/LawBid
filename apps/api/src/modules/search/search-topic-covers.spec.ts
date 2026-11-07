import { GUEST_USER_ID } from '../../common/viewer/guest';
import type { TagDto } from './search.dto';
import { TOPIC_COVERS_KEY } from './search.provider';
import { SearchService } from './search.service';

type Priv = {
  withCovers(list: TagDto[]): Promise<TagDto[]>;
  trending(): Promise<TagDto[]>;
};

/** Owner 2026-11-04 (R-406): GET /search/trending-tags and /search/tags
 * carry each hashtag topic's cover from the nightly snapshot; the links are
 * resolved once for everyone and cached briefly; no snapshot = no cover. */
describe('SearchService topic covers', () => {
  function make(opts: {
    snapshot?: Record<string, { postId: string }>;
    posts?: { id: string; url: string | null }[];
    trending?: TagDto[];
  }) {
    const main = new Map<string, string>();
    if (opts.snapshot)
      main.set(TOPIC_COVERS_KEY, JSON.stringify(opts.snapshot));
    if (opts.trending) {
      main.set('search:trending-tags', JSON.stringify(opts.trending));
    }
    const cacheStore = new Map<string, string>();
    const cache = {
      get: jest.fn((k: string) => Promise.resolve(cacheStore.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        cacheStore.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const findMany = jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        (opts.posts ?? [])
          .filter((p) => where.id.in.includes(p.id))
          .map((p) => ({ id: p.id })),
      ),
    );
    const present = jest.fn((rows: { id: string }[], viewer: string) =>
      Promise.resolve(
        rows.map((r) => {
          const url = opts.posts?.find((p) => p.id === r.id)?.url ?? null;
          return {
            id: r.id,
            media: url ? [{ previewUrl: url, url }] : [],
            video: null,
            viewer,
          };
        }),
      ),
    );
    const svc = Object.create(SearchService.prototype) as SearchService;
    Object.assign(svc, {
      redis: { get: (k: string) => Promise.resolve(main.get(k) ?? null) },
      cacheRedis: cache,
      prisma: { post: { findMany } },
      posts: { present },
    });
    return { svc: svc as unknown as Priv, cache, findMany, present };
  }

  const tags = (...names: string[]): TagDto[] =>
    names.map((tag) => ({ tag, postsCount: 1, categoryCode: null }));

  it('a topic with a media post gets its cover and post id; a text-only topic gets null', async () => {
    const { svc, present } = make({
      snapshot: { alimony: { postId: 'p1' }, textonly: { postId: 'p2' } },
      posts: [
        { id: 'p1', url: 'https://cdn/p1_320.jpg' },
        { id: 'p2', url: null },
      ],
    });
    const out = await svc.withCovers(tags('alimony', 'textonly', 'nocover'));
    expect(out).toEqual([
      expect.objectContaining({
        tag: 'alimony',
        coverUrl: 'https://cdn/p1_320.jpg',
        coverPostId: 'p1',
      }),
      expect.objectContaining({
        tag: 'textonly',
        coverUrl: null,
        coverPostId: null,
      }),
      expect.objectContaining({
        tag: 'nocover',
        coverUrl: null,
        coverPostId: null,
      }),
    ]);
    // Presented as the guest: the links are the same for everyone.
    expect(present).toHaveBeenCalledWith(expect.any(Array), GUEST_USER_ID);
  });

  it('no snapshot yet (job never ran): every topic falls back, nothing is queried', async () => {
    const { svc, findMany } = make({});
    const out = await svc.withCovers(tags('alimony'));
    expect(out[0]).toEqual(
      expect.objectContaining({ coverUrl: null, coverPostId: null }),
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('a post deleted since the snapshot is no cover any more', async () => {
    const { svc } = make({
      snapshot: { alimony: { postId: 'gone' } },
      posts: [],
    });
    const [row] = await svc.withCovers(tags('alimony'));
    expect(row.coverUrl).toBeNull();
    expect(row.coverPostId).toBeNull();
  });

  it('resolved links are cached by the set of posts: the second call presents nothing', async () => {
    const { svc, present, cache } = make({
      snapshot: { alimony: { postId: 'p1' } },
      posts: [{ id: 'p1', url: 'https://cdn/p1_320.jpg' }],
    });
    await svc.withCovers(tags('alimony'));
    await svc.withCovers(tags('alimony'));
    expect(present).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    const ttl = (cache.set.mock.calls[0] as unknown[])[3] as number;
    // Shorter than a signed media link lives (1 h).
    expect(ttl).toBeLessThan(3600);
  });

  it('GET /search/trending-tags: the cached list comes out with covers', async () => {
    const { svc } = make({
      trending: tags('alimony', 'plain'),
      snapshot: { alimony: { postId: 'p1' } },
      posts: [{ id: 'p1', url: 'https://cdn/p1_320.jpg' }],
    });
    const out = await svc.trending();
    expect(out.map((t) => [t.tag, t.coverUrl])).toEqual([
      ['alimony', 'https://cdn/p1_320.jpg'],
      ['plain', null],
    ]);
  });
});
