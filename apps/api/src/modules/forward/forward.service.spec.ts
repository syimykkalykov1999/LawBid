import { HttpException } from '@nestjs/common';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { ChannelsService } from '../channels/channels.service';
import type { ChatService } from '../chat/chat.service';
import type { GroupsService } from '../groups/groups.service';
import { ForwardService, forwardKey } from './forward.service';

/** Owner 2026-10-21 (Telegram «Переслать»): the batch rules. */
describe('ForwardService', () => {
  const user = { sub: 'u1' } as RequestUser;
  const src = (id: string) => ({ kind: 'message' as const, id });
  const to = (id: string) => ({ kind: 'conversation' as const, id });

  it('one stable key per request × message × chat', () => {
    const k = forwardKey('r1', src('m1'), to('c1'));
    expect(k).toMatch(/^f-[0-9a-f]{40}$/);
    expect(forwardKey('r1', src('m1'), to('c1'))).toBe(k);
    expect(forwardKey('r2', src('m1'), to('c1'))).not.toBe(k);
    expect(forwardKey('r1', src('m1'), to('c2'))).not.toBe(k);
  });

  it('keeps the order, rings once per chat, reports a refused pair', async () => {
    const sent: [string, string, boolean][] = [];
    const chat = {
      forwardSource: jest.fn((_u: RequestUser, id: string) =>
        Promise.resolve({ kind: 'text', text: id, fromName: 'Ann' }),
      ),
      sendForwarded: jest.fn(
        (
          _u: RequestUser,
          target: string,
          _k: string,
          c: { text: string },
          o: { silent: boolean },
        ) => {
          if (target === 'closed') {
            return Promise.reject(
              new HttpException({ code: 'CONVERSATION_CLOSED' }, 409),
            );
          }
          sent.push([target, c.text, o.silent]);
          return Promise.resolve({ id: `${target}-${c.text}` });
        },
      ),
    } as unknown as ChatService;
    const service = new ForwardService(
      chat,
      {} as GroupsService,
      {} as ChannelsService,
    );
    const out = await service.forward(user, {
      requestId: 'r',
      sources: [src('m1'), src('m2'), src('m1')],
      targets: [to('a'), to('closed')],
    });
    expect(sent).toEqual([
      ['a', 'm1', true],
      ['a', 'm2', false],
    ]);
    expect(out.results.map((r) => [r.target.id, r.status, r.code])).toEqual([
      ['a', 'sent', null],
      ['a', 'sent', null],
      ['closed', 'failed', 'CONVERSATION_CLOSED'],
      ['closed', 'failed', 'CONVERSATION_CLOSED'],
    ]);
  });

  it('at most 200 pairs', async () => {
    const service = new ForwardService(
      {} as ChatService,
      {} as GroupsService,
      {} as ChannelsService,
    );
    await expect(
      service.forward(user, {
        requestId: 'r',
        sources: Array.from({ length: 11 }, (_, i) => src(`m${i}`)),
        targets: Array.from({ length: 20 }, (_, i) => to(`c${i}`)),
      }),
    ).rejects.toThrow(HttpException);
  });
});
