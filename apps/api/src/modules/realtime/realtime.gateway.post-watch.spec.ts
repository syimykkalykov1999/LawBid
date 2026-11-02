import type { Socket } from 'socket.io';
import { RealtimeGateway } from './realtime.gateway';

/** Security audit 2026-11-02: `post:watch` follows the REST comment rules. */
describe('RealtimeGateway post:watch', () => {
  const postId = '11111111-1111-4111-8111-111111111111';

  function make(post: { author_id: string } | null, blocked: boolean) {
    const findPost = jest.fn().mockResolvedValue(post);
    const findBlock = jest
      .fn()
      .mockResolvedValue(blocked ? { blocker_id: 'x' } : null);
    const gw = Object.create(RealtimeGateway.prototype) as Record<
      string,
      unknown
    >;
    gw.prisma = {
      post: { findFirst: findPost },
      userBlock: { findFirst: findBlock },
    };
    const join = jest.fn().mockResolvedValue(undefined);
    const socket = {
      data: { user: { sub: 'viewer' } },
      join,
    } as unknown as Socket;
    const watch = () =>
      (
        gw as unknown as {
          watchPost: (s: Socket, b: unknown) => Promise<{ ok: boolean }>;
        }
      ).watchPost(socket, { postId });
    return { watch, join, findPost, findBlock };
  }

  it('joins the room of a visible post', async () => {
    const t = make({ author_id: 'author' }, false);
    expect((await t.watch()).ok).toBe(true);
    expect(t.join).toHaveBeenCalledWith(`post:${postId}`);
    const where = t.findPost.mock.calls[0][0].where;
    expect(where).toMatchObject({ deleted_at: null, status: 'published' });
    const stranger = JSON.stringify(where.OR[1]);
    expect(stranger).toContain('"archived_at":null');
    expect(stranger).toContain('"comments_enabled":true');
    expect(stranger).toContain('suspended');
    // the author's own branch has no archive / comments-off rule
    expect(where.OR[0]).toEqual({ author_id: 'viewer' });
  });

  it('refuses a post that is not visible (archived, comments off, ...)', async () => {
    const t = make(null, false);
    expect((await t.watch()).ok).toBe(false);
    expect(t.join).not.toHaveBeenCalled();
  });

  it('refuses when the author and the watcher blocked each other', async () => {
    const t = make({ author_id: 'author' }, true);
    expect((await t.watch()).ok).toBe(false);
    expect(t.join).not.toHaveBeenCalled();
  });
});
