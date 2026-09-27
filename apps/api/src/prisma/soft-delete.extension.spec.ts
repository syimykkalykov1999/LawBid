import { Prisma } from '@prisma/client';
import * as softDeleteModule from './soft-delete.extension';
import {
  SOFT_DELETE_META,
  SOFT_DELETE_READ_OPERATIONS,
  applySoftDeleteToArgs,
  buildSoftDeleteMeta,
  mentionsSoftDeleteField,
  onlyDeleted,
  withDeleted,
} from './soft-delete.extension';
import { PrismaService } from './prisma.service';

const meta = SOFT_DELETE_META;

describe('soft-delete extension (docs/02_DATABASE.md §1.4)', () => {
  describe('model list derived from the DMMF', () => {
    it('contains exactly the models whose schema has a deleted_at column', () => {
      const expected = Prisma.dmmf.datamodel.models
        .filter((m) => m.fields.some((f) => f.name === 'deleted_at'))
        .map((m) => m.name)
        .sort();
      expect([...meta.models].sort()).toEqual(expected);
      // The spec's soft-deletable tables that exist today.
      for (const model of ['User', 'Case', 'Post', 'File', 'Comment']) {
        expect(meta.models.has(model)).toBe(true);
      }
      expect(meta.models.has('Session')).toBe(false);
      expect(meta.models.has('Bid')).toBe(false);
    });

    it('picks up a new deleted_at model without code changes', () => {
      const m = buildSoftDeleteMeta([
        {
          name: 'Widget',
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isList: false },
            {
              name: 'deleted_at',
              kind: 'scalar',
              type: 'DateTime',
              isList: false,
            },
          ],
        },
        {
          name: 'Gadget',
          fields: [
            { name: 'id', kind: 'scalar', type: 'String', isList: false },
            // a relation named deleted_at is not the soft-delete column
            {
              name: 'deleted_at',
              kind: 'object',
              type: 'Widget',
              isList: false,
            },
          ],
        },
      ]);
      expect([...m.models]).toEqual(['Widget']);
    });
  });

  describe('top-level reads', () => {
    it.each([...SOFT_DELETE_READ_OPERATIONS])(
      '%s on a soft-delete model adds deleted_at: null',
      (operation) => {
        const out = applySoftDeleteToArgs(meta, 'Case', operation, {
          where: { status: 'open' },
        }) as { where: unknown };
        expect(out.where).toEqual({ status: 'open', deleted_at: null });
      },
    );

    it('adds a where when the caller passed no args at all', () => {
      expect(applySoftDeleteToArgs(meta, 'Post', 'count', undefined)).toEqual({
        where: { deleted_at: null },
      });
      expect(applySoftDeleteToArgs(meta, 'Post', 'findMany', {})).toEqual({
        where: { deleted_at: null },
      });
    });

    it('keeps unique selectors intact for findUnique(OrThrow)', () => {
      const out = applySoftDeleteToArgs(meta, 'User', 'findUniqueOrThrow', {
        where: { id: 'u1' },
        select: { id: true },
      });
      expect(out).toEqual({
        where: { id: 'u1', deleted_at: null },
        select: { id: true },
      });
    });

    it('does not mutate the caller args object', () => {
      const args = { where: { id: 'u1' } };
      applySoftDeleteToArgs(meta, 'User', 'findFirst', args);
      expect(args).toEqual({ where: { id: 'u1' } });
    });

    it('leaves models without deleted_at untouched', () => {
      const args = { where: { user_id: 'u1' } };
      expect(applySoftDeleteToArgs(meta, 'Session', 'findFirst', args)).toEqual(
        args,
      );
      expect(
        applySoftDeleteToArgs(meta, 'Session', 'findMany', undefined),
      ).toBeUndefined();
    });

    it.each([
      'create',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ])('%s is not rewritten (writes keep their where)', (operation) => {
      const args = { where: { id: 'c1' }, data: { deleted_at: new Date(0) } };
      expect(applySoftDeleteToArgs(meta, 'Case', operation, args)).toEqual(
        args,
      );
    });
  });

  describe('opt-out', () => {
    it('withDeleted() matches every row (empty deleted_at filter)', () => {
      const out = applySoftDeleteToArgs(meta, 'User', 'findUnique', {
        where: withDeleted({ id: 'u1' }),
      });
      expect(out).toEqual({ where: { id: 'u1', deleted_at: {} } });
    });

    it('onlyDeleted() keeps the caller filter', () => {
      const out = applySoftDeleteToArgs(meta, 'Post', 'findMany', {
        where: onlyDeleted({ author_id: 'a' }),
      });
      expect(out).toEqual({
        where: { author_id: 'a', deleted_at: { not: null } },
      });
    });

    it('an explicit deleted_at inside AND / OR / NOT counts as opting out', () => {
      const where = {
        OR: [{ deleted_at: null }, { deleted_at: { gt: new Date(0) } }],
      };
      expect(
        applySoftDeleteToArgs(meta, 'Case', 'findMany', { where }),
      ).toEqual({ where });
      expect(
        mentionsSoftDeleteField({ AND: { NOT: { deleted_at: null } } }),
      ).toBe(true);
    });

    it('deleted_at: undefined is NOT an opt-out (Prisma ignores undefined)', () => {
      const out = applySoftDeleteToArgs(meta, 'Case', 'findMany', {
        where: { deleted_at: undefined, status: 'open' },
      }) as { where: Record<string, unknown> };
      expect(out.where.deleted_at).toBeNull();
    });
  });

  describe('nested include / select', () => {
    it('filters to-many relations whose target soft-deletes', () => {
      const out = applySoftDeleteToArgs(meta, 'User', 'findUnique', {
        where: { id: 'u1' },
        include: {
          posts: true,
          sessions: true,
          cases_as_client: { where: { status: 'open' }, take: 5 },
        },
      }) as { include: Record<string, unknown> };
      expect(out.include.posts).toEqual({ where: { deleted_at: null } });
      // Session has no deleted_at: left alone.
      expect(out.include.sessions).toBe(true);
      expect(out.include.cases_as_client).toEqual({
        where: { status: 'open', deleted_at: null },
        take: 5,
      });
    });

    it('recurses through nested levels and non-soft-delete parents', () => {
      const out = applySoftDeleteToArgs(meta, 'Conversation', 'findMany', {
        select: {
          id: true,
          messages: { select: { id: true } },
        },
      }) as { select: Record<string, unknown>; where?: unknown };
      // Conversation itself has no deleted_at: no top-level where.
      expect(out.where).toBeUndefined();
      expect(out.select.messages).toEqual({
        select: { id: true },
        where: { deleted_at: null },
      });

      const deep = applySoftDeleteToArgs(meta, 'User', 'findMany', {
        include: { posts: { include: { comments: true } } },
      }) as { include: { posts: { include: { comments: unknown } } } };
      expect(deep.include.posts.include.comments).toEqual({
        where: { deleted_at: null },
      });
    });

    it('never filters to-one relations (would null out a required relation)', () => {
      const out = applySoftDeleteToArgs(meta, 'Post', 'findMany', {
        include: { author: true },
      }) as { include: Record<string, unknown> };
      expect(out.include.author).toBe(true);
    });

    it('respects an explicit nested deleted_at filter', () => {
      const out = applySoftDeleteToArgs(meta, 'User', 'findFirst', {
        include: { posts: { where: onlyDeleted() } },
      }) as { include: Record<string, unknown> };
      expect(out.include.posts).toEqual({
        where: { deleted_at: { not: null } },
      });
    });

    it('filters relation counts (_count select and _count: true)', () => {
      const out = applySoftDeleteToArgs(meta, 'User', 'findMany', {
        select: { _count: { select: { posts: true, sessions: true } } },
      }) as { select: { _count: { select: Record<string, unknown> } } };
      expect(out.select._count.select.posts).toEqual({
        where: { deleted_at: null },
      });
      expect(out.select._count.select.sessions).toBe(true);

      const all = applySoftDeleteToArgs(meta, 'Post', 'findMany', {
        include: { _count: true },
      }) as { include: { _count: { select: Record<string, unknown> } } };
      expect(all.include._count.select.comments).toEqual({
        where: { deleted_at: null },
      });
      expect(all.include._count.select.likes).toBe(true);
    });

    it('rewrites include on writes too (the returned rows are reads)', () => {
      const out = applySoftDeleteToArgs(meta, 'User', 'update', {
        where: { id: 'u1' },
        data: { first_name: 'A' },
        include: { posts: true },
      }) as { where: unknown; include: Record<string, unknown> };
      expect(out.where).toEqual({ id: 'u1' });
      expect(out.include.posts).toEqual({ where: { deleted_at: null } });
    });
  });

  describe('PrismaService', () => {
    it('is the soft-delete-extended client and keeps its lifecycle hooks', async () => {
      const spy = jest.spyOn(softDeleteModule, 'softDeleteExtension');
      const svc = new PrismaService();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();

      expect(typeof svc.onModuleInit).toBe('function');
      expect(typeof svc.onModuleDestroy).toBe('function');
      expect(typeof svc.$transaction).toBe('function');
      expect(typeof svc.user.findMany).toBe('function');
      await svc.$disconnect();
    });
  });
});
