import { newShardedId } from './shard-id';
import { parseShardKey, shardContext, shardKeyOf } from './shard-context';
import { shardStoreForRequest } from './shard-context.interceptor';

const U7 = '00000000-0000-4000-8000-000000000007';

describe('shardContext (shard-ready step 4)', () => {
  it('is empty by default and scoped to the callback', async () => {
    expect(shardContext.current()).toBeUndefined();
    await shardContext.run(5, async () => {
      await Promise.resolve();
      expect(shardContext.current()?.shard).toBe(5);
    });
    expect(shardContext.current()).toBeUndefined();
  });

  it('runForCase uses the shard inside the id, runForUser the hash', () => {
    shardContext.runForCase(newShardedId(42), () =>
      expect(shardContext.current()?.shard).toBe(42),
    );
    shardContext.runForUser(U7, () =>
      expect(shardContext.current()?.shard).toBe(7),
    );
  });

  it('never throws on garbage: no context', () => {
    shardContext.runForCase('nope', () =>
      expect(shardContext.current()).toBeUndefined(),
    );
    shardContext.run(999, () => expect(shardContext.current()).toBeUndefined());
    shardContext.runFromKey(undefined, () =>
      expect(shardContext.current()).toBeUndefined(),
    );
    shardContext.runFromKey('what:ever', () =>
      expect(shardContext.current()).toBeUndefined(),
    );
  });

  it('round-trips job shard keys', () => {
    const caseId = newShardedId(9);
    expect(parseShardKey(shardKeyOf.case(caseId))?.shard).toBe(9);
    expect(parseShardKey(shardKeyOf.user(U7))?.shard).toBe(7);
    expect(parseShardKey(shardKeyOf.shard(200))?.shard).toBe(200);
    expect(parseShardKey(shardKeyOf.shard(256))).toBeNull();
    shardContext.runFromKey(shardKeyOf.case(caseId), () =>
      expect(shardContext.current()?.shard).toBe(9),
    );
  });

  it('can pin a physical database and leave to primary', () => {
    shardContext.run(3, () => {
      shardContext.runOnPhysical('db1', () =>
        expect(shardContext.current()?.physical).toBe('db1'),
      );
      shardContext.runOnPrimary(() =>
        expect(shardContext.current()?.physical).toBe('primary'),
      );
    });
  });
});

describe('shardStoreForRequest (HTTP)', () => {
  const id = newShardedId(33);
  it('reads :caseId / :conversationId', () => {
    expect(shardStoreForRequest({ params: { caseId: id } })?.shard).toBe(33);
    expect(
      shardStoreForRequest({ params: { conversationId: id } })?.shard,
    ).toBe(33);
  });

  it(':id counts only under a sharded route', () => {
    const at = (path: string) =>
      shardStoreForRequest({ route: { path }, params: { id } })?.shard;
    expect(at('/api/v1/cases/:id/bids')).toBe(33);
    expect(at('/api/v1/posts/:id')).toBe(33);
    expect(at('/api/v1/promo-codes/:id')).toBeUndefined();
  });

  it(':userId, then the signed-in user as a weak context', () => {
    expect(shardStoreForRequest({ params: { userId: U7 } })).toMatchObject({
      shard: 7,
      source: 'param:userId',
    });
    expect(shardStoreForRequest({ user: { sub: U7 } })).toMatchObject({
      shard: 7,
      source: 'auth',
    });
  });

  it('route id wins over the user; nothing = undefined', () => {
    expect(
      shardStoreForRequest({
        route: { path: '/cases/:id' },
        params: { id },
        user: { sub: U7 },
      })?.shard,
    ).toBe(33);
    expect(shardStoreForRequest({})).toBeUndefined();
    expect(shardStoreForRequest({ params: { caseId: 'x' } })).toBeUndefined();
  });
});
