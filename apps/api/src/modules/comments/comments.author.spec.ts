import { CommentsService } from './comments.service';

/** R-387 (owner 04.11): a client's comment carries their @handle (a tap
 * opens their mini-profile) and their photo, not just initials. */
describe('CommentsService comment authors', () => {
  const avatarUrlsMany = jest.fn((ids: (string | null)[]) => {
    const out = new Map<string, { url: string; url256: string }>();
    for (const id of ids) {
      if (id)
        out.set(id, {
          url: `https://cdn/${id}`,
          url256: `https://cdn/${id}-256`,
        });
    }
    return Promise.resolve(out);
  });
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'att',
          role: 'attorney',
          first_name: 'Nora',
          last_name: 'Mills',
          avatar_file_id: 'f-att',
          client_profile: null,
          attorney_profile: {
            username: 'nora',
            verification_status: 'verified',
            name_mismatch: false,
            trust_badge: true,
            licenses: [{ id: 'l1' }],
          },
        },
        {
          id: 'cli',
          role: 'client',
          first_name: 'Sam',
          last_name: 'Kent',
          avatar_file_id: 'f-cli',
          client_profile: { username: 'samk' },
          attorney_profile: null,
        },
        {
          id: 'cli2',
          role: 'client',
          first_name: 'Ann',
          last_name: null,
          avatar_file_id: null,
          client_profile: { username: null },
          attorney_profile: null,
        },
      ]),
    },
    commentLike: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CommentsService(
    prisma as never,
    {} as never,
    { pending: jest.fn().mockResolvedValue(new Map()) } as never,
    {} as never,
    { avatarUrlsMany } as never,
    {} as never,
    {
      resolve: jest.fn().mockResolvedValue(new Map()),
      pick: () => [],
    } as never,
  );
  const row = (id: string, author: string) => ({
    id,
    post_id: 'p1',
    parent_comment_id: null,
    author_id: author,
    body: 'hi',
    like_count: 0,
    reply_count: 0,
    created_at: new Date('2026-11-04T00:00:00Z'),
  });

  it('gives attorneys and clients their handle and photo', async () => {
    const items = await (
      service as unknown as {
        present: (
          rows: unknown[],
          viewer: string,
          postAuthor: string,
        ) => Promise<
          {
            author: {
              kind: string;
              username: string | null;
              avatarUrl: string | null;
            };
          }[]
        >;
      }
    ).present(
      [row('c1', 'att'), row('c2', 'cli'), row('c3', 'cli2')],
      'viewer',
      'att',
    );
    expect(items.map((i) => i.author)).toEqual([
      expect.objectContaining({
        kind: 'attorney',
        username: 'nora',
        avatarUrl: 'https://cdn/f-att-256',
      }),
      expect.objectContaining({
        kind: 'client',
        username: 'samk',
        avatarUrl: 'https://cdn/f-cli-256',
      }),
      expect.objectContaining({
        kind: 'client',
        username: null,
        avatarUrl: null,
      }),
    ]);
    expect(avatarUrlsMany).toHaveBeenCalledWith(['f-att', 'f-cli', null]);
  });
});
