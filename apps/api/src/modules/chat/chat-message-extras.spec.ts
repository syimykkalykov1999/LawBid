import type { PrismaService } from '../../prisma/prisma.service';
import { loadMessageExtras } from './chat-message-extras';

/** Load test round 2: a message just sent skips the reaction / pin
 * lookups (they cannot exist yet); everything else is read as before. */
describe('loadMessageExtras', () => {
  const rows = [{ id: 'm1', conversation_id: 'c1', reply_to_id: 'm0' }];
  const db = () => ({
    messageReaction: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ message_id: 'm1', user_id: 'u', emoji: '👍' }]),
    },
    messagePin: {
      findMany: jest.fn().mockResolvedValue([{ message_id: 'm1' }]),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'm0',
          sender_id: 'u',
          type: 'text',
          body_display: 'x',
          revoked_at: null,
        },
      ]),
    },
  });

  it('a page reads reactions, pins and quoted messages', async () => {
    const p = db();
    const x = await loadMessageExtras(p as unknown as PrismaService, rows);
    expect(x.reactions.get('m1')).toEqual([{ emoji: '👍', userId: 'u' }]);
    expect(x.pinned.has('m1')).toBe(true);
    expect(x.replyTargets.has('m0')).toBe(true);
  });

  it('a fresh message reads only the quoted message', async () => {
    const p = db();
    const x = await loadMessageExtras(p as unknown as PrismaService, rows, {
      fresh: true,
    });
    expect(p.messageReaction.findMany).not.toHaveBeenCalled();
    expect(p.messagePin.findMany).not.toHaveBeenCalled();
    expect(x.reactions.size).toBe(0);
    expect(x.pinned.size).toBe(0);
    expect(x.replyTargets.has('m0')).toBe(true);
  });
});
