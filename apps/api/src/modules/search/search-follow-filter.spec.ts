import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchPeopleQueryDto } from './search.dto';
import { SearchService } from './search.service';

/**
 * Owner 2026-10-28 (R-084): People search «по подписке» — only the people
 * the viewer follows / does not follow; omitted = everyone.
 */
describe('People search: follow filter', () => {
  const found = [
    { role: 'attorney', id: 'a1', tier: 0 },
    { role: 'client', id: 'c1', tier: 0 },
    { role: 'attorney', id: 'a2', tier: 0 },
  ];

  function make(followed: string[]) {
    const store = new Map<string, string>();
    const cache = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      set: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve('OK');
      }),
    };
    const prisma = {
      follow: {
        findMany: jest
          .fn()
          .mockResolvedValue(followed.map((followee_id) => ({ followee_id }))),
      },
    };
    const provider = { searchPeople: jest.fn().mockResolvedValue(found) };
    const follows = {
      present: jest.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id }))),
      ),
    };
    const clients = {
      presentMany: jest.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id }))),
      ),
    };
    const svc = Object.create(SearchService.prototype) as Record<
      string,
      unknown
    >;
    Object.assign(svc, {
      limits: { consume: jest.fn().mockResolvedValue(undefined) },
      provider,
      prisma,
      follows,
      clients,
      blocks: { hiddenIds: jest.fn().mockResolvedValue(new Set()) },
      redis: cache,
      cacheRedis: cache,
    });
    return { svc: svc as unknown as SearchService, prisma, provider };
  }
  const user = { sub: 'viewer', role: 'client' } as never;
  const ids = (page: { items: { attorney: unknown; client: unknown }[] }) =>
    page.items.map((i) => ((i.attorney ?? i.client) as { id: string }).id);

  it('no filter: everyone, and follows is not read', async () => {
    const { svc, prisma } = make(['a1']);
    const page = await svc.people(user, { q: 'an' });
    expect(ids(page)).toEqual(['a1', 'c1', 'a2']);
    expect(prisma.follow.findMany).not.toHaveBeenCalled();
  });

  it('following: only the followed (attorneys and clients)', async () => {
    const { svc, prisma } = make(['a1', 'c1']);
    const page = await svc.people(user, {
      q: 'an',
      follow: 'following',
    } as never);
    expect(ids(page)).toEqual(['a1', 'c1']);
    // One read of the primary key (follower_id, followee_id IN …).
    expect(prisma.follow.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.follow.findMany.mock.calls[0][0].where.follower_id).toBe(
      'viewer',
    );
  });

  it('not_following: only the others', async () => {
    const { svc } = make(['a1', 'c1']);
    const page = await svc.people(user, {
      q: 'an',
      follow: 'not_following',
    } as never);
    expect(ids(page)).toEqual(['a2']);
  });

  it('the ranked list is shared, the follow filter is per viewer', async () => {
    const { svc, provider } = make(['a1']);
    await svc.people(user, { q: 'an', follow: 'following' } as never);
    await svc.people(user, { q: 'an', follow: 'not_following' } as never);
    expect(provider.searchPeople).toHaveBeenCalledTimes(1);
  });

  it('the query param accepts only following / not_following', async () => {
    const ok = plainToInstance(SearchPeopleQueryDto, {
      q: 'an',
      follow: 'following',
    });
    expect(await validate(ok)).toHaveLength(0);
    const bad = plainToInstance(SearchPeopleQueryDto, {
      q: 'an',
      follow: 'all',
    });
    expect((await validate(bad)).map((e) => e.property)).toContain('follow');
  });
});
