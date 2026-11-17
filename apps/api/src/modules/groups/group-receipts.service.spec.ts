import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupReceiptsService, covers } from './group-receipts.service';

/**
 * Groups WhatsApp parity: who has read my group message, from the read
 * marks the group already keeps (no new table, no per-page cost).
 */
const user = { sub: 'me', role: 'client' } as never;
const at = (min: number) => new Date(Date.UTC(2026, 10, 16, 12, min));

function setup(opts: {
  target?: unknown;
  topics?: boolean;
  members?: { user_id: string; last_read_message_id: string | null }[];
  topicReads?: { user_id: string; last_read_message_id: string | null }[];
  marks?: { id: string; created_at: Date }[];
}) {
  const prisma = {
    chatGroupMessage: {
      findFirst: jest.fn().mockResolvedValue(
        'target' in opts
          ? opts.target
          : {
              id: 'm2',
              created_at: at(2),
              sender_id: 'me',
              topic_id: null,
              type: 'text',
            },
      ),
      findMany: jest.fn().mockResolvedValue(opts.marks ?? []),
    },
    chatGroupMember: {
      findMany: jest.fn().mockResolvedValue(opts.members ?? []),
    },
    chatGroupTopicRead: {
      findMany: jest.fn().mockResolvedValue(opts.topicReads ?? []),
    },
  };
  const groups = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    requireMember: jest.fn().mockResolvedValue({
      group: { topics_enabled: !!opts.topics, general_topic_id: 'gen' },
    }),
  };
  const presenter = {
    people: jest.fn((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, { userId: id }]))),
    ),
  };
  const svc = new GroupReceiptsService(
    prisma as never,
    groups as never,
    presenter as never,
  );
  return { svc, prisma };
}

describe('covers', () => {
  it('the same message or a later one', () => {
    const t = { id: 'b', created_at: at(2) };
    expect(covers({ id: 'b', created_at: at(2) }, t)).toBe(true);
    expect(covers({ id: 'c', created_at: at(2) }, t)).toBe(true);
    expect(covers({ id: 'x', created_at: at(3) }, t)).toBe(true);
    expect(covers({ id: 'a', created_at: at(2) }, t)).toBe(false);
    expect(covers({ id: 'z', created_at: at(1) }, t)).toBe(false);
  });
});

describe('GroupReceiptsService.readers', () => {
  it('readers = members whose mark is at or past the message', async () => {
    const { svc, prisma } = setup({
      members: [
        { user_id: 'ann', last_read_message_id: 'm3' },
        { user_id: 'bob', last_read_message_id: 'm1' },
        { user_id: 'cy', last_read_message_id: null },
      ],
      marks: [
        { id: 'm3', created_at: at(3) },
        { id: 'm1', created_at: at(1) },
      ],
    });
    const out = await svc.readers(user, 'g1', 'm2');
    expect(out).toEqual({ readers: [{ userId: 'ann' }], recipients: 3 });
    // The author is not a recipient of their own message.
    expect(prisma.chatGroupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { group_id: 'g1', left_at: null, user_id: { not: 'me' } },
      }),
    );
    expect(prisma.chatGroupTopicRead.findMany).not.toHaveBeenCalled();
  });

  it('forum groups: the topic mark wins over the group one', async () => {
    const { svc } = setup({
      topics: true,
      members: [{ user_id: 'ann', last_read_message_id: 'm1' }],
      topicReads: [{ user_id: 'ann', last_read_message_id: 'm3' }],
      marks: [{ id: 'm3', created_at: at(3) }],
    });
    const out = await svc.readers(user, 'g1', 'm2');
    expect(out.readers).toEqual([{ userId: 'ann' }]);
  });

  it('only the author; no service lines', async () => {
    await expect(
      setup({
        target: {
          id: 'm2',
          created_at: at(2),
          sender_id: 'ann',
          topic_id: null,
          type: 'text',
        },
      }).svc.readers(user, 'g1', 'm2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup({ target: null }).svc.readers(user, 'g1', 'm2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({
        target: {
          id: 'm2',
          created_at: at(2),
          sender_id: null,
          topic_id: null,
          type: 'system',
        },
      }).svc.readers(user, 'g1', 'm2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
