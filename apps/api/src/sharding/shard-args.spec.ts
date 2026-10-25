import { hashShard, newShardedId, shardOf } from './shard-id';
import { shardFromArgs } from './shard-args';

const USER = '11111111-1111-4111-8111-1111111111ab';

describe('shardFromArgs (queries without a shard context)', () => {
  it('create: owner key hashes the user, parent key reads the parent id', () => {
    expect(shardFromArgs('Case', 'create', { data: { client_id: USER } })).toBe(
      hashShard(USER),
    );
    const caseId = newShardedId(77);
    expect(shardFromArgs('Bid', 'create', { data: { case_id: caseId } })).toBe(
      77,
    );
    expect(
      shardFromArgs('Bid', 'createMany', { data: [{ case_id: caseId }] }),
    ).toBe(77);
    expect(
      shardFromArgs('Bid', 'create', {
        data: { case: { connect: { id: caseId } } },
      }),
    ).toBe(77);
  });

  it('reads: key columns in where (equals / in / compound unique / AND), else a sharded id', () => {
    const caseId = newShardedId(5);
    expect(
      shardFromArgs('Bid', 'findMany', { where: { case_id: caseId } }),
    ).toBe(5);
    expect(
      shardFromArgs('Bid', 'count', { where: { case_id: { in: [caseId] } } }),
    ).toBe(5);
    expect(
      shardFromArgs('Review', 'findUnique', {
        where: { case_id_attorney_id: { case_id: caseId, attorney_id: USER } },
      }),
    ).toBe(5);
    expect(
      shardFromArgs('Bid', 'findFirst', {
        where: { AND: [{ case_id: caseId }] },
      }),
    ).toBe(5);
    const bidId = newShardedId(9);
    expect(shardFromArgs('Bid', 'findUnique', { where: { id: bidId } })).toBe(
      shardOf(bidId),
    );
  });

  it('names nothing, or only a NOT / OR branch: undefined', () => {
    expect(
      shardFromArgs('Bid', 'findMany', { where: { attorney_id: USER } }),
    ).toBeUndefined();
    expect(
      shardFromArgs('Bid', 'findMany', {
        where: { NOT: { case_id: newShardedId(1) } },
      }),
    ).toBeUndefined();
    expect(
      shardFromArgs('Bid', 'findMany', {
        where: { OR: [{ case_id: newShardedId(1) }] },
      }),
    ).toBeUndefined();
    expect(
      shardFromArgs('User', 'findMany', { where: { id: USER } }),
    ).toBeUndefined();
    expect(shardFromArgs('Bid', 'findMany', {})).toBeUndefined();
  });
});
