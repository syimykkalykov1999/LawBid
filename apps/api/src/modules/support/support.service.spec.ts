import type { SupportMessage, SupportTicket } from '@prisma/client';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RateLimitService } from '../auth/services/rate-limit.service';
import { SupportService } from './support.service';

const T0 = new Date('2026-10-01T10:00:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const TICKET = '33333333-3333-4333-8333-333333333333';

function ticket(over: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: TICKET,
    user_id: USER,
    subject: 'Cannot pay',
    category: 'billing',
    status: 'waiting_user',
    priority: 'normal',
    assignee_id: ADMIN,
    unread_by_admin: false,
    unread_by_user: true,
    last_message_at: T0,
    resolved_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

function msg(over: Partial<SupportMessage>): SupportMessage {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    ticket_id: TICKET,
    author_user_id: null,
    author_admin_id: null,
    internal: false,
    body: 'hi',
    created_at: T0,
    ...over,
  };
}

function setup(opts: { found?: SupportTicket | null; allowed?: boolean } = {}) {
  const found = opts.found === undefined ? ticket() : opts.found;
  const prisma = {
    supportTicket: {
      findFirst: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(ticket({ ...data, id: TICKET })),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(ticket({ ...found, ...data })),
        ),
    },
    supportMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(msg(data))),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: ADMIN, first_name: 'Anna' }]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const rateLimit = {
    consumeFixedWindow: jest.fn().mockResolvedValue({
      allowed: opts.allowed ?? true,
      remaining: 1,
      retryAfterSeconds: 100,
    }),
  };
  const settings = { number: jest.fn().mockResolvedValue(5) };
  const service = new SupportService(
    prisma as unknown as PrismaService,
    rateLimit as unknown as RateLimitService,
    settings as unknown as AppSettingsService,
  );
  return { service, prisma, rateLimit, settings };
}

describe('SupportService (app side)', () => {
  it('only ever looks up the caller’s own tickets; others are a 404', async () => {
    const { service, prisma } = setup({ found: null });
    await expect(service.get(USER, TICKET)).rejects.toMatchObject({
      response: { code: ErrorCode.NOT_FOUND },
    });
    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: { id: TICKET, user_id: USER },
    });
  });

  it('lists only the caller’s tickets', async () => {
    const { service, prisma } = setup();
    await service.list(USER);
    expect(prisma.supportTicket.findMany.mock.calls[0][0].where).toMatchObject({
      user_id: USER,
    });
  });

  it('never loads internal notes and hides admin identity', async () => {
    const { service, prisma } = setup();
    prisma.supportMessage.findMany.mockResolvedValue([
      msg({ id: 'a', author_user_id: USER, body: 'help' }),
      msg({ id: 'b', author_admin_id: ADMIN, body: 'on it' }),
    ]);
    const out = await service.get(USER, TICKET);
    expect(prisma.supportMessage.findMany.mock.calls[0][0].where).toEqual({
      ticket_id: TICKET,
      internal: false,
    });
    expect(out.messages).toEqual([
      expect.objectContaining({ author: 'me', authorName: null }),
      expect.objectContaining({
        author: 'support',
        authorName: 'LawBid Support · Anna',
      }),
    ]);
    expect(JSON.stringify(out)).not.toContain(ADMIN);
    expect(out.messages[0]).not.toHaveProperty('internal');
    // Opening marks it read.
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: TICKET },
      data: { unread_by_user: false },
    });
    expect(out.unread).toBe(false);
  });

  it('replying to a resolved ticket reopens it and flags the admins', async () => {
    const { service, prisma } = setup({
      found: ticket({ status: 'resolved', resolved_at: T0 }),
    });
    await service.reply(USER, TICKET, 'still broken');
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'open',
          resolved_at: null,
          unread_by_admin: true,
        }),
      }),
    );
  });

  it('replying to a closed ticket is 409 and writes nothing', async () => {
    const { service, prisma } = setup({ found: ticket({ status: 'closed' }) });
    await expect(service.reply(USER, TICKET, 'x')).rejects.toMatchObject({
      response: { code: ErrorCode.SUPPORT_TICKET_CLOSED },
    });
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
  });

  it('ticket creation is rate limited per user (429)', async () => {
    const { service, prisma, rateLimit } = setup({ allowed: false });
    await expect(
      service.create(USER, { subject: 'Help', category: 'other', body: 'x' }),
    ).rejects.toMatchObject({ response: { code: ErrorCode.RATE_LIMITED } });
    expect(rateLimit.consumeFixedWindow).toHaveBeenCalledWith(
      ['support-ticket', USER],
      5,
      3600,
    );
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it('creates the ticket open and unread by admins with the first message', async () => {
    const { service, prisma } = setup();
    const out = await service.create(USER, {
      subject: 'Help',
      category: 'bug',
      body: 'crash',
    });
    expect(prisma.supportTicket.create.mock.calls[0][0].data).toMatchObject({
      user_id: USER,
      status: 'open',
      unread_by_admin: true,
    });
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].author).toBe('me');
  });

  it('close is idempotent', async () => {
    const { service, prisma } = setup({ found: ticket({ status: 'closed' }) });
    const out = await service.close(USER, TICKET);
    expect(out.canReply).toBe(false);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });
});
