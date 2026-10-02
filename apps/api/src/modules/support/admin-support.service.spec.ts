import type { SupportMessage, SupportTicket } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { ADMIN_ROLES_KEY } from '../admin-auth/admin-auth.decorators';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';

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
    status: 'open',
    priority: 'normal',
    assignee_id: null,
    unread_by_admin: true,
    unread_by_user: false,
    last_message_at: T0,
    resolved_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

function setup(found: SupportTicket | null = ticket()) {
  const prisma = {
    supportTicket: {
      findUnique: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve(ticket({ ...found, ...data })),
        ),
    },
    supportMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: '44444444-4444-4444-8444-444444444444',
          created_at: T0,
          author_user_id: null,
          ...data,
        } as SupportMessage),
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ ui_language: 'ru' }),
      findMany: jest.fn().mockResolvedValue([
        { id: ADMIN, first_name: 'Anna', last_name: 'K', role: null },
        { id: USER, first_name: 'Jo', last_name: 'Doe', role: 'client' },
      ]),
    },
    adminProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const notifications = { emit: jest.fn().mockResolvedValue({ id: 'n' }) };
  const subs = { isActive: jest.fn().mockResolvedValue(true) };
  const service = new AdminSupportService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    subs as unknown as SubscriptionAccessService,
  );
  return { service, prisma, notifications };
}

describe('AdminSupportService', () => {
  it('an internal note changes nothing the user sees and notifies nobody', async () => {
    const { service, prisma, notifications } = setup();
    const out = await service.reply(ADMIN, TICKET, {
      body: 'user looks like a duplicate',
      internal: true,
    });
    expect(out.internal).toBe(true);
    expect(prisma.supportMessage.create.mock.calls[0][0].data).toMatchObject({
      internal: true,
      author_admin_id: ADMIN,
    });
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('a public reply → waiting_user, unread for the user, one notification', async () => {
    const { service, prisma, notifications } = setup();
    await service.reply(ADMIN, TICKET, { body: 'Fixed, try again' });
    expect(prisma.supportTicket.update.mock.calls[0][0].data).toMatchObject({
      status: 'waiting_user',
      unread_by_user: true,
      unread_by_admin: false,
    });
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    const [emit] = notifications.emit.mock.calls[0];
    expect(emit).toMatchObject({
      type: 'admin_broadcast',
      recipientId: USER,
      payload: { title: 'LawBid Support', ticketId: TICKET },
    });
    // No admin identity and no message text in the push.
    expect(JSON.stringify(emit)).not.toContain(ADMIN);
    expect(JSON.stringify(emit)).not.toContain('Fixed, try again');
    expect(emit.payload.body).toContain('Cannot pay');
  });

  it('the admin can pick the status of a public reply', async () => {
    const { service, prisma } = setup();
    await service.reply(ADMIN, TICKET, { body: 'Done', status: 'resolved' });
    expect(prisma.supportTicket.update.mock.calls[0][0].data).toMatchObject({
      status: 'resolved',
      resolved_at: expect.any(Date),
    });
  });

  it('the admin view includes internal notes and marks the ticket read', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: USER,
      first_name: 'Jo',
      last_name: 'Doe',
      role: 'client',
      status: 'active',
      ui_language: 'en',
      email: 'jo@example.com',
      email_verified_at: T0,
      phone_e164: null,
      phone_verified_at: null,
      created_at: T0,
      attorney_profile: null,
      client_profile: { username: 'jo' },
    });
    prisma.supportMessage.findMany.mockResolvedValue([
      {
        id: 'm1',
        ticket_id: TICKET,
        author_user_id: USER,
        author_admin_id: null,
        internal: false,
        body: 'help',
        created_at: T0,
      },
      {
        id: 'm2',
        ticket_id: TICKET,
        author_user_id: null,
        author_admin_id: ADMIN,
        internal: true,
        body: 'note',
        created_at: T0,
      },
    ]);
    const out = await service.get(TICKET);
    expect(prisma.supportMessage.findMany.mock.calls[0][0].where).toEqual({
      ticket_id: TICKET,
    });
    expect(out.messages.map((m) => m.internal)).toEqual([false, true]);
    expect(out.unreadByAdmin).toBe(false);
    expect(out.userSummary).toMatchObject({
      username: 'jo',
      hasEmail: true,
      hasPhone: false,
      subscriptionActive: null,
    });
    expect(JSON.stringify(out.userSummary)).not.toContain('jo@example.com');
  });

  it('assigning to a non-admin is a validation error', async () => {
    const { service } = setup();
    await expect(
      service.update(TICKET, { assigneeId: USER }),
    ).rejects.toMatchObject({ response: { code: ErrorCode.VALIDATION_ERROR } });
  });

  it('assignee=me / unassigned filters', async () => {
    const { service, prisma } = setup();
    await service.list(ADMIN, { assignee: 'me' });
    await service.list(ADMIN, { assignee: 'unassigned', status: 'open' });
    expect(prisma.supportTicket.findMany.mock.calls[0][0].where).toMatchObject({
      assignee_id: ADMIN,
    });
    expect(prisma.supportTicket.findMany.mock.calls[1][0].where).toMatchObject({
      assignee_id: null,
      status: 'open',
    });
  });

  it('missing ticket → 404', async () => {
    const { service } = setup(null);
    await expect(service.get(TICKET)).rejects.toMatchObject({
      response: { code: ErrorCode.NOT_FOUND },
    });
  });
});

describe('AdminSupportController roles', () => {
  const roles = (m?: 'replyAdminSupportTicket' | 'updateAdminSupportTicket') =>
    Reflect.getMetadata(
      ADMIN_ROLES_KEY,
      m
        ? (Object.getOwnPropertyDescriptor(AdminSupportController.prototype, m)
            ?.value as object)
        : AdminSupportController,
    ) as string[];

  it('moderators read; only super_admin + support write', () => {
    expect(roles()).toEqual(['super_admin', 'support', 'moderator']);
    expect(roles('replyAdminSupportTicket')).toEqual([
      'super_admin',
      'support',
    ]);
    expect(roles('updateAdminSupportTicket')).toEqual([
      'super_admin',
      'support',
    ]);
  });
});
