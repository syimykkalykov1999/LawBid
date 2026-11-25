/* eslint-disable @typescript-eslint/require-await -- hand-made Prisma, realtime and team fakes */
import { ChatService } from './chat.service';

/**
 * Pack B (25.11, ROUND2 #4, #5): a lawyer of the firm's team on the bid
 * writes in the case chat (PR-5) like its attorney, so the client's
 * «delivered» and «read» must reach the team too — the ticks on a team
 * member's message moved only after a reload. The disappearing timer line
 * goes to every member as well (announce() already did).
 */
describe('ChatService receipts reach the firm team of a case chat', () => {
  const t0 = new Date('2026-11-25T10:00:00.000Z');
  const t1 = new Date('2026-11-25T10:01:00.000Z');
  const messages = new Map([
    ['m1', { id: 'm1', created_at: t0 }],
    ['m2', { id: 'm2', created_at: t1 }],
  ]);
  const conv = {
    id: 'conv1',
    client_id: 'client',
    attorney_id: 'attorney',
    case_id: 'case1',
    bid_id: 'bid1',
    status: 'active',
    request_status: null,
    contacts_unlocked: true,
    disappear_after_s: null,
  };

  function make(reader: string) {
    const participant = {
      last_read_message_id: 'm1',
      last_delivered_message_id: 'm1',
      marked_unread_at: null,
    };
    const tx = {
      conversationParticipant: {
        findUniqueOrThrow: jest.fn(async () => participant),
        update: jest.fn(async () => ({})),
      },
      message: {
        findUnique: jest.fn(
          async (q: { where: { id_conversation_id: { id: string } } }) =>
            messages.get(q.where.id_conversation_id.id) ?? null,
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      message: {
        findFirst: jest.fn(
          async (q: { where: { id: string } }) =>
            messages.get(q.where.id) ?? null,
        ),
      },
    };
    const realtime = { toUsers: jest.fn() };
    const team = {
      teamOfChat: jest.fn(async () => ['lawyer2', 'attorney']),
    };
    const svc = Object.create(ChatService.prototype) as ChatService;
    const priv = svc as unknown as Record<string, unknown>;
    priv.prisma = prisma;
    priv.realtime = realtime;
    priv.badges = { chatsChanged: jest.fn(async () => undefined) };
    priv.team = team;
    priv.load = jest.fn(async () => conv);
    const user = {
      sub: reader,
      role: reader === 'client' ? 'client' : 'attorney',
    } as never;
    return { svc, realtime, team, user, prisma };
  }

  const audience = (
    realtime: { toUsers: jest.Mock },
    event: string,
  ): string[][] =>
    realtime.toUsers.mock.calls
      .filter((c: unknown[]) => c[1] === event)
      .map((c: unknown[]) => c[0] as string[]);

  it('the client reading tells the attorney and the team, once each', async () => {
    const { svc, realtime, user } = make('client');
    await svc.read(user, 'conv1', 'm2');
    expect(audience(realtime, 'message:read')).toEqual([
      ['attorney', 'lawyer2'],
    ]);
  });

  it('the client getting the messages tells the attorney and the team', async () => {
    const { svc, realtime, user } = make('client');
    await svc.delivered(user, 'conv1', 'm2');
    expect(audience(realtime, 'message:delivered')).toEqual([
      ['attorney', 'lawyer2'],
    ]);
  });

  it('a team member reading tells the client only (no team lookup)', async () => {
    const { svc, realtime, team, user } = make('lawyer2');
    await svc.read(user, 'conv1', 'm2');
    expect(audience(realtime, 'message:read')).toEqual([['client']]);
    expect(team.teamOfChat).not.toHaveBeenCalled();
  });

  it('the chat list delivering for the client tells the team too', async () => {
    const { svc, realtime, prisma } = make('client');
    (prisma as unknown as Record<string, unknown>).$queryRaw = jest.fn(
      async () => [
        { conversation_id: 'conv1', last_delivered_message_id: 'm2' },
      ],
    );
    const deliverListed = (
      svc as unknown as {
        deliverListed: (
          viewer: string,
          convs: unknown[],
          messageOf: Map<string, { id: string; sender_id: string | null }>,
          partOf: Map<string, { last_delivered_message_id: string | null }>,
        ) => Promise<void>;
      }
    ).deliverListed.bind(svc);
    await deliverListed(
      'client',
      [{ ...conv, last_message_id: 'm2' }],
      new Map([['m2', { id: 'm2', sender_id: 'lawyer2' }]]),
      new Map([['conv1:client', { last_delivered_message_id: 'm1' }]]),
    );
    expect(audience(realtime, 'message:delivered')).toEqual([
      ['attorney', 'lawyer2'],
    ]);
  });

  it('the disappearing timer line and refresh go to the team too', async () => {
    const { svc, realtime, team } = make('client');
    const direct = { ...conv, case_id: null, bid_id: null };
    const priv = svc as unknown as Record<string, unknown>;
    priv.load = jest.fn(async () => direct);
    priv.assertNotBlockedIn = jest.fn(async () => undefined);
    priv.present = jest.fn(async () => [{ id: 'conv1' }]);
    priv.toMessage = jest.fn(() => ({ id: 'sys' }));
    const message = { id: 'sys', created_at: t1 };
    const tx = {
      conversation: { update: jest.fn(async () => direct) },
      message: { create: jest.fn(async () => message) },
      conversationParticipant: { updateMany: jest.fn(async () => ({})) },
    };
    priv.prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    team.teamOfChat.mockResolvedValueOnce(['lawyer2']);
    await svc.setDisappearing(
      { sub: 'client', role: 'client' } as never,
      'conv1',
      86400,
    );
    expect(audience(realtime, 'message:new')).toEqual([
      ['client'],
      ['attorney'],
      ['lawyer2'],
    ]);
  });
});
