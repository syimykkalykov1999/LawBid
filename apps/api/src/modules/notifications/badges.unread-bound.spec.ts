import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { BadgesService } from './badges.service';

/** Owner 2026-10-25 (DB audit, finding 6): the unread count of a read chat
 * carries an explicit `m.created_at >= lr.created_at` range, so the
 * messages(conversation_id, created_at DESC, id DESC) index can bound the
 * scan; the row comparison stays for ties and the result is unchanged. */
describe('BadgesService.countChats unread bound', () => {
  it('has the created_at range bound next to the keyset comparison', async () => {
    const sqls: string[] = [];
    const prisma = {
      notificationSetting: { findMany: () => Promise.resolve([]) },
      $queryRaw: (strings: TemplateStringsArray) => {
        sqls.push(strings.join('?'));
        return Promise.resolve([{ n: 3n }]);
      },
    } as unknown as PrismaService;
    const svc = new BadgesService(prisma, {} as Redis, {} as RealtimePublisher);
    const n = await (
      svc as unknown as { countChats(id: string): Promise<number> }
    ).countChats('u1');
    expect(n).toBeGreaterThan(0);
    const sql = (sqls.find((q) => q.includes('lr.created_at')) ?? '').replace(
      /\s+/g,
      ' ',
    );
    expect(sql).toContain('(lr.id IS NULL OR m.created_at >= lr.created_at)');
    expect(sql).toContain('(m.created_at, m.id) > (lr.created_at, lr.id)');
  });
});
