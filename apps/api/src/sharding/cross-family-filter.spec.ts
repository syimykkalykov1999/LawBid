import { stitchHandler } from './cross-family-stitch';

/** Shard-ready step 8: relation filters into a global model become FK id lists. */
describe('cross-family relation filters (stitch)', () => {
  function setup(userIds: string[]) {
    const seen: unknown[] = [];
    const primary = {
      user: {
        findMany: (a: unknown) => {
          seen.push(a);
          return Promise.resolve(userIds.map((id) => ({ id })));
        },
      },
    };
    const queried: unknown[] = [];
    const handler = stitchHandler(() => primary);
    const run = (model: string, operation: string, args: unknown) =>
      handler({
        model,
        operation,
        args,
        query: (a: unknown) => {
          queried.push(a);
          return Promise.resolve([]);
        },
      });
    return { run, seen, queried };
  }

  it('replaces a to-one filter by an id list from the primary database', async () => {
    const { run, seen, queried } = setup(['u1', 'u2']);
    await run('Post', 'findMany', {
      where: { deleted_at: null, author: { status: 'active' } },
    });
    expect(seen[0]).toEqual({
      where: { AND: [{ status: 'active' }], deleted_at: {} },
      select: { id: true },
    });
    expect(queried[0]).toEqual({
      where: {
        deleted_at: null,
        AND: [{ author_id: { in: ['u1', 'u2'] } }],
      },
    });
  });

  it('handles is / isNot / null, and recurses through NOT and OR', async () => {
    const { run, queried } = setup(['u1']);
    await run('Post', 'count', {
      where: {
        OR: [{ author: { is: { status: 'x' } } }, { author: null }],
        NOT: { author: { isNot: { status: 'y' } } },
      },
    });
    expect(queried[0]).toEqual({
      where: {
        OR: [
          { AND: [{ author_id: { in: ['u1'] } }] },
          { AND: [{ author_id: null }] },
        ],
        NOT: {
          AND: [
            { OR: [{ author_id: null }, { author_id: { notIn: ['u1'] } }] },
          ],
        },
      },
    });
  });

  it('leaves a query without global relation filters untouched', async () => {
    const { run, seen, queried } = setup([]);
    const args = { where: { id: 'p' } };
    await run('Post', 'findMany', args);
    expect(seen).toHaveLength(0);
    expect(queried[0]).toBe(args);
  });
});
