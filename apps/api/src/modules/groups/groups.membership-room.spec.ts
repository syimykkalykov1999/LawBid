import { GroupsService } from './groups.service';

/** Detective R2B-6 (14.11): a member who leaves or is removed is taken out
 * of the group's chat room at once, so its open screen stops receiving
 * «печатает…» from the others and cannot send it either. */
describe('GroupsService.endMembership leaves the chat room', () => {
  it.each(['removed', 'left'] as const)('%s', async (reason) => {
    const tx = {
      chatGroupMember: {
        update: jest.fn(() => Promise.resolve({})),
        count: jest.fn(() => Promise.resolve(3)),
      },
      chatGroup: { update: jest.fn(() => Promise.resolve({})) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const realtime = { toUsers: jest.fn(), leaveRoom: jest.fn() };
    const badges = { chatsChanged: jest.fn(() => Promise.resolve()) };
    const svc = new GroupsService(
      prisma as never,
      {} as never,
      realtime as never,
      {} as never,
      badges as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(svc as unknown as { system(): Promise<unknown> }, 'system')
      .mockResolvedValue({ id: 'm1', created_at: new Date() });
    await (
      svc as unknown as {
        endMembership(
          g: string,
          u: string,
          r: 'left' | 'removed',
          a: string | null,
        ): Promise<unknown>;
      }
    ).endMembership('g1', 'u2', reason, 'owner1');
    expect(realtime.leaveRoom).toHaveBeenCalledWith(['u2'], 'conversation:g1');
  });
});
