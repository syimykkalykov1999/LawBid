import { randomUUID } from 'node:crypto';
import {
  hashShard,
  isShardedId,
  newShardedId,
  shardOf,
  timestampOf,
} from './shard-id';
import { shardOperationHandler } from './shard.extension';

type Args = Record<string, any>;
interface Call {
  model: string;
  operation: string;
  args: Args;
}

function setup(
  opts: {
    lookup?: (m: string, id: string) => number | null;
    enabled?: boolean;
  } = {},
) {
  const lookup = jest.fn((m: string, id: string) =>
    Promise.resolve(opts.lookup ? opts.lookup(m, id) : null),
  );
  const handler = shardOperationHandler(lookup, () => opts.enabled ?? true);
  const seen: Args[] = [];
  const run = async ({ model, operation, args }: Call): Promise<Args> => {
    const query = jest.fn((a: Args) => {
      seen.push(a);
      return Promise.resolve('result');
    });
    const out = await handler({
      model,
      operation,
      args,
      query: query as never,
    });
    expect(out).toBe('result');
    return seen[seen.length - 1];
  };
  return { run, lookup };
}

describe('shard extension: ids and shard_id on create', () => {
  it('Case: v8 id and shard_id = hashShard(client_id)', async () => {
    const { run } = setup();
    const client = randomUUID();
    const sent = await run({
      model: 'Case',
      operation: 'create',
      args: { data: { client_id: client, title: 't' } },
    });
    expect(isShardedId(sent.data.id)).toBe(true);
    expect(shardOf(sent.data.id)).toBe(hashShard(client));
    expect(sent.data.shard_id).toBe(hashShard(client));
    expect(sent.data.title).toBe('t');
    expect(timestampOf(sent.data.id)!).toBeGreaterThan(Date.now() - 5000);
  });

  it('does not mutate the caller args', async () => {
    const { run } = setup();
    const data = { client_id: randomUUID() };
    await run({ model: 'Case', operation: 'create', args: { data } });
    expect(data).toEqual({ client_id: data.client_id });
  });

  it('child of a sharded parent inherits the embedded shard, no lookup', async () => {
    const { run, lookup } = setup();
    const caseId = newShardedId(77);
    const sent = await run({
      model: 'Bid',
      operation: 'create',
      args: { data: { case_id: caseId, attorney_id: randomUUID() } },
    });
    expect(sent.data.shard_id).toBe(77);
    expect(shardOf(sent.data.id)).toBe(77);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('grandchildren inherit through the chain (conversation -> message)', async () => {
    const { run } = setup();
    const conv = newShardedId(200);
    const msg = await run({
      model: 'Message',
      operation: 'create',
      args: { data: { conversation_id: conv } },
    });
    expect(shardOf(msg.data.id)).toBe(200);
    expect(msg.data.shard_id).toBe(200);
  });

  it('reads the parent from a checked input: { case: { connect: { id } } }', async () => {
    const { run } = setup();
    const sent = await run({
      model: 'Bid',
      operation: 'create',
      args: { data: { case: { connect: { id: newShardedId(9) } } } },
    });
    expect(sent.data.shard_id).toBe(9);
  });

  it('legacy v4 parent: uses the parent stored shard_id', async () => {
    const { run, lookup } = setup({ lookup: () => 123 });
    const legacyCase = randomUUID();
    const sent = await run({
      model: 'Bid',
      operation: 'create',
      args: { data: { case_id: legacyCase } },
    });
    expect(lookup).toHaveBeenCalledWith('Case', legacyCase);
    expect(sent.data.shard_id).toBe(123);
    expect(shardOf(sent.data.id)).toBe(123);
  });

  it('legacy v4 parent not found: falls back to hashShard(parent id)', async () => {
    const { run } = setup({ lookup: () => null });
    const legacyCase = randomUUID();
    const sent = await run({
      model: 'Bid',
      operation: 'create',
      args: { data: { case_id: legacyCase } },
    });
    expect(sent.data.shard_id).toBe(hashShard(legacyCase));
  });

  it('falls back to the owner key when the parent is absent (direct chat)', async () => {
    const { run } = setup();
    const client = randomUUID();
    const sent = await run({
      model: 'Conversation',
      operation: 'create',
      args: { data: { case_id: null, client_id: client } },
    });
    expect(sent.data.shard_id).toBe(hashShard(client));
  });

  it('user family: shard by the owner', async () => {
    const { run } = setup();
    const user = randomUUID();
    const sent = await run({
      model: 'Notification',
      operation: 'create',
      args: { data: { user_id: user } },
    });
    expect(sent.data.shard_id).toBe(hashShard(user));
    expect(shardOf(sent.data.id)).toBe(hashShard(user));
  });

  it('keeps an explicit id and an explicit shard_id', async () => {
    const { run } = setup();
    const id = randomUUID();
    const sent = await run({
      model: 'Notification',
      operation: 'create',
      args: { data: { id, shard_id: 5, user_id: randomUUID() } },
    });
    expect(sent.data.id).toBe(id);
    expect(sent.data.shard_id).toBe(5);
  });

  it('composite-key table gets shard_id but no generated id', async () => {
    const { run } = setup();
    const post = newShardedId(31);
    const sent = await run({
      model: 'PostLike',
      operation: 'create',
      args: { data: { post_id: post, user_id: randomUUID() } },
    });
    expect(sent.data.shard_id).toBe(31);
    expect(sent.data.id).toBeUndefined();
  });

  it('id-keyed-by-parent table (CaseBilling) does not get a generated id', async () => {
    const { run } = setup();
    const sent = await run({
      model: 'CaseBilling',
      operation: 'create',
      args: { data: { case_id: newShardedId(4) } },
    });
    expect(sent.data.shard_id).toBe(4);
    expect(sent.data.id).toBeUndefined();
  });

  it('no key in the data (nested create): shard 0 v8 id, no shard_id sent', async () => {
    const { run } = setup();
    const sent = await run({
      model: 'Bid',
      operation: 'create',
      args: { data: { title: 'x' } },
    });
    expect(sent.data.shard_id).toBeUndefined();
    expect(shardOf(sent.data.id)).toBe(0);
  });

  it('a non-uuid key is left for the database to reject', async () => {
    const { run } = setup();
    const sent = await run({
      model: 'Notification',
      operation: 'create',
      args: { data: { user_id: 'not-a-uuid' } },
    });
    expect(sent.data.shard_id).toBeUndefined();
  });

  it('createMany stamps every row (array and single object)', async () => {
    const { run } = setup();
    const a = randomUUID();
    const b = randomUUID();
    const sent = await run({
      model: 'Notification',
      operation: 'createMany',
      args: { data: [{ user_id: a }, { user_id: b }], skipDuplicates: true },
    });
    expect(sent.skipDuplicates).toBe(true);
    const rows = sent.data as { shard_id: number; id: string }[];
    expect(rows.map((d) => d.shard_id)).toEqual([hashShard(a), hashShard(b)]);
    expect(new Set(rows.map((d) => d.id)).size).toBe(2);
    const one = await run({
      model: 'Notification',
      operation: 'createManyAndReturn',
      args: { data: { user_id: a } },
    });
    expect(one.data.shard_id).toBe(hashShard(a));
  });

  it('upsert stamps only the create branch', async () => {
    const { run } = setup();
    const user = randomUUID();
    const sent = await run({
      model: 'NotificationSetting',
      operation: 'upsert',
      args: {
        where: { user_id: user },
        create: { user_id: user },
        update: { x: 1 },
      },
    });
    expect(sent.create.shard_id).toBe(hashShard(user));
    expect(sent.update).toEqual({ x: 1 });
    expect(sent.where).toEqual({ user_id: user });
  });

  it('leaves global models, reads, updates and deletes untouched', async () => {
    const { run } = setup();
    for (const c of [
      { model: 'User', operation: 'create', args: { data: { email: 'a' } } },
      { model: 'Notification', operation: 'findMany', args: { where: {} } },
      {
        model: 'Notification',
        operation: 'update',
        args: { where: { id: 'x' }, data: { read: true } },
      },
      {
        model: 'Notification',
        operation: 'delete',
        args: { where: { id: 'x' } },
      },
    ] as Call[]) {
      const sent = await run(c);
      expect(sent).toEqual(c.args);
    }
  });

  it('kill switch: passes everything through unchanged', async () => {
    const { run } = setup({ enabled: false });
    const args = { data: { client_id: randomUUID() } };
    const sent = await run({ model: 'Case', operation: 'create', args });
    expect(sent).toEqual(args);
  });

  it('raw operations without a model pass through', async () => {
    const { run } = setup();
    const sent = await run({
      model: undefined as unknown as string,
      operation: '$queryRaw',
      args: { sql: 'x' },
    });
    expect(sent).toEqual({ sql: 'x' });
  });
});
