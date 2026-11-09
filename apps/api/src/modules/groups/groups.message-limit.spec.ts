import { HttpException, HttpStatus } from '@nestjs/common';
import { GroupsService } from './groups.service';

/** Feature reality audit 2026-11-08: the admin «Сообщений в минуту»
 * (rate_limit.message_per_minute) now holds group messages too, not only
 * direct chats. */
function setup(limited: boolean) {
  const consume = jest.fn(() =>
    limited
      ? Promise.reject(
          new HttpException('Too many', HttpStatus.TOO_MANY_REQUESTS),
        )
      : Promise.resolve(),
  );
  const svc = new GroupsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    { consume } as never,
  );
  const member = {
    admin: false,
    group: { who_can_post: 'all', who_can_media: 'all' },
  };
  jest.spyOn(svc, 'requireMember').mockResolvedValue(member as never);
  jest
    .spyOn(svc as unknown as { findOwn(): Promise<null> }, 'findOwn')
    .mockResolvedValue(null);
  const topic = jest
    .spyOn(svc, 'writableTopic')
    .mockRejectedValue(new Error('stop here'));
  return { svc, consume, topic };
}

const USER = { sub: 'u1' } as never;

describe('group messages and rate_limit.message_per_minute', () => {
  it('over the limit: refused with 429 before anything is written', async () => {
    const { svc, consume, topic } = setup(true);
    const err = await svc
      .send(USER, 'g1', { type: 'text', body: 'hi' } as never)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(consume).toHaveBeenCalledWith('message', 'u1');
    expect(topic).not.toHaveBeenCalled();
  });

  it('under the limit: the send goes on', async () => {
    const { svc, consume, topic } = setup(false);
    await expect(
      svc.send(USER, 'g1', { type: 'text', body: 'hi' } as never),
    ).rejects.toThrow('stop here');
    expect(consume).toHaveBeenCalledWith('message', 'u1');
    expect(topic).toHaveBeenCalled();
  });
});
