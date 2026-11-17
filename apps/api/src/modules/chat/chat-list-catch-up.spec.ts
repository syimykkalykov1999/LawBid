import type { Prisma } from '../../generated/prisma/client';
import { ChatService } from './chat.service';

/**
 * Owner 2026-10-22 (load audit finding 2): after a socket gap the app asks
 * `GET /conversations?updatedSince=…` instead of reloading its list. A chat
 * counts as changed when its row changed or when I read it elsewhere (my
 * participant row's `last_read_at`, which the row itself never sees).
 */
describe('chat list catch-up (updatedSince)', () => {
  const svc = Object.create(ChatService.prototype) as {
    changedSince(since: string): Prisma.ConversationWhereInput;
  };

  it('matches a changed row or a read by either side since then (verify 17.11)', () => {
    const since = '2026-10-22T09:00:00.000Z';
    const at = new Date(since);
    expect(svc.changedSince(since)).toEqual({
      OR: [
        { updated_at: { gte: at } },
        { participants: { some: { last_read_at: { gte: at } } } },
      ],
    });
  });
});
