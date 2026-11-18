import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import type { AssistantContextService } from '../auth/assistant/assistant-context';
import type { SessionRevocationService } from '../auth/services/session-revocation.service';
import type { TokenService } from '../auth/services/token.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BidTeamService } from '../firms/bid-team.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Verify 17.11 (batch 9): a firm colleague who joined a bid keeps a
 * participant row in the case chat. After the bid was rejected (or they
 * left the firm) that row still let `conversation:join` put them into the
 * room — they heard and sent «печатает…» in the client's chat.
 */
function setup(opts: { liveTeam: boolean; joinedBid: boolean }) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    conversationParticipant: {
      findUnique: jest.fn().mockResolvedValue({ user_id: 'mate' }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany,
    },
    chatGroupMember: { findFirst: jest.fn().mockResolvedValue(null) },
    conversation: {
      findUnique: jest.fn().mockResolvedValue({
        client_id: 'client',
        attorney_id: 'lead',
        case_id: 'case-1',
        bid_id: 'bid-1',
      }),
    },
    bidParticipant: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.joinedBid ? { bid_id: 'bid-1' } : null),
    },
  };
  const bidTeam = { inChat: jest.fn().mockResolvedValue(opts.liveTeam) };
  const gateway = new RealtimeGateway(
    {} as TokenService,
    {} as SessionRevocationService,
    prisma as unknown as PrismaService,
    { zadd: jest.fn(), expire: jest.fn() } as unknown as Redis,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger,
    {} as AssistantContextService,
    {} as PresenceService,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    bidTeam as unknown as BidTeamService,
  );
  jest
    .spyOn(
      gateway as unknown as { touchViewing: () => Promise<void> },
      'touchViewing',
    )
    .mockResolvedValue(undefined);
  const join = jest.fn().mockResolvedValue(undefined);
  const socket = {
    id: 'sock-1',
    join,
    rooms: new Set<string>(),
    data: {
      user: { sub: 'mate', sid: 'chain', role: 'attorney' },
      viewing: new Set<string>(),
    },
  } as unknown as Socket;
  return { gateway, socket, join, deleteMany };
}

describe('RealtimeGateway conversation:join — a team place must be live', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('a colleague whose bid is no longer live is kept out and the stale row goes', async () => {
    const h = setup({ liveTeam: false, joinedBid: true });
    expect(await h.gateway.join(h.socket, { conversationId: id })).toEqual({
      ok: false,
    });
    expect(h.join).not.toHaveBeenCalled();
    expect(h.deleteMany).toHaveBeenCalled();
  });

  it('a colleague on the live team joins as before', async () => {
    const h = setup({ liveTeam: true, joinedBid: true });
    expect(await h.gateway.join(h.socket, { conversationId: id })).toEqual({
      ok: true,
    });
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
});
