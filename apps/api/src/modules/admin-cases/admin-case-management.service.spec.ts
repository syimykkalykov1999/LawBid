import { ConflictException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { BidStateMachine } from '../bids/domain/bid-state-machine';
import { CaseStateMachine } from '../cases/domain/case-state-machine';
import type { ChatSystemMessages } from '../chat/chat-system.service';
import type { CaseJournalService } from '../journal/case-journal.service';
import type { NotificationsService } from '../notifications/notifications.service';
import {
  AdminCaseManagementService,
  CASE_COMMAND_ACTION,
  clientNotice,
} from './admin-case-management.service';

const admin: AdminActor = {
  id: 'admin-1',
  adminRole: 'support',
  sessionId: 's',
  justification: null,
  ip: '1.2.3.4',
};
const CASE_ID = '00000000-0000-4000-8000-000000000001';

function setup(status: string | null) {
  const tx = {
    case: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          status === null ? null : { client_id: 'client-1', status },
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: CASE_ID }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const applyToActive = jest.fn().mockResolvedValue([
    {
      id: 'bid-1',
      case_id: CASE_ID,
      attorney_id: 'att-1',
      plan: { event: 'bid_rejected' },
    },
  ]);
  const bidMachine = { applyToActive } as unknown as BidStateMachine;
  const journal = { append: jest.fn().mockResolvedValue({}) };
  const notifications = { emit: jest.fn().mockResolvedValue(null) };
  const chat = {
    post: jest.fn().mockResolvedValue([]),
    publish: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminCaseManagementService(
    prisma,
    new CaseStateMachine(),
    bidMachine,
    journal as unknown as CaseJournalService,
    notifications as unknown as NotificationsService,
    chat as unknown as ChatSystemMessages,
    audit as unknown as AuditLogService,
  );
  // The card is a separate read; not under test here.
  jest
    .spyOn(service, 'card')
    .mockResolvedValue({ id: CASE_ID } as unknown as Awaited<
      ReturnType<AdminCaseManagementService['card']>
    >);
  return { service, tx, applyToActive, journal, notifications, chat, audit };
}

describe('AdminCaseManagementService.act', () => {
  it('maps commands onto the admin state-machine actions', () => {
    expect(CASE_COMMAND_ACTION).toEqual({
      hide: 'admin_archive',
      close: 'admin_close',
      archive: 'admin_archive',
      restore: 'admin_restore',
    });
  });

  it('close: open → closed, journal + bids rejected + chats + audit', async () => {
    const s = setup('open');
    await s.service.act(admin, CASE_ID, 'close', 'Spam case reported 3x');
    expect(s.tx.case.updateMany).toHaveBeenCalledWith({
      where: { id: CASE_ID, status: 'open', deleted_at: null },
      data: expect.objectContaining({ status: 'closed' }),
    });
    expect(s.journal.append).toHaveBeenCalledWith(
      s.tx,
      expect.objectContaining({
        caseId: CASE_ID,
        clientId: 'client-1',
        actor: { userId: 'admin-1', role: 'admin' },
        event: 'closed',
        payload: {
          by: 'admin',
          command: 'close',
          reason: 'Spam case reported 3x',
        },
      }),
    );
    expect(s.applyToActive).toHaveBeenCalledWith(
      s.tx,
      { caseId: CASE_ID },
      'auto_reject',
    );
    expect(s.notifications.emit).toHaveBeenCalledWith(
      {
        type: 'bid_rejected',
        recipientId: 'att-1',
        payload: { caseId: CASE_ID, bidId: 'bid-1', reason: 'case_closed' },
      },
      s.tx,
    );
    expect(s.notifications.emit).toHaveBeenCalledWith(
      {
        type: 'case_closed',
        recipientId: 'client-1',
        payload: { caseId: CASE_ID },
      },
      s.tx,
    );
    expect(s.chat.post).toHaveBeenCalled();
    expect(s.chat.publish).toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'admin.case.close',
        targetType: 'case',
        targetId: CASE_ID,
        before: { status: 'open' },
        after: {
          status: 'closed',
          command: 'close',
          reason: 'Spam case reported 3x',
        },
      }),
      s.tx,
    );
  });

  it('hide archives and tells the client why (moderation_notice)', async () => {
    const s = setup('open');
    await s.service.act(admin, CASE_ID, 'hide', 'Contains contact details');
    expect(s.tx.case.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'archived' }),
      }),
    );
    expect(s.notifications.emit).toHaveBeenCalledWith(
      {
        type: 'moderation_notice',
        recipientId: 'client-1',
        payload: { reason: 'Contains contact details', caseId: CASE_ID },
      },
      s.tx,
    );
  });

  it('restore: archived → open, no bids touched', async () => {
    const s = setup('archived');
    await s.service.act(admin, CASE_ID, 'restore', 'Archived by mistake');
    expect(s.tx.case.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'open', archived_at: null }),
      }),
    );
    expect(s.applyToActive).not.toHaveBeenCalled();
    expect(s.chat.post).not.toHaveBeenCalled();
  });

  it.each([
    ['close', 'in_progress'],
    ['archive', 'closed'],
    ['restore', 'open'],
    ['hide', 'disputed'],
  ] as const)(
    '%s from %s is CASE_INVALID_STATE (nothing written)',
    async (command, status) => {
      const s = setup(status);
      const err = await s.service
        .act(admin, CASE_ID, command, 'Reason long enough')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: ErrorCode.CASE_INVALID_STATE,
      });
      expect(s.tx.case.updateMany).not.toHaveBeenCalled();
      expect(s.audit.record).not.toHaveBeenCalled();
    },
  );

  it('an unknown case is CASE_NOT_FOUND', async () => {
    const s = setup(null);
    const err = await s.service
      .act(admin, CASE_ID, 'close', 'Reason long enough')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).getResponse()).toMatchObject({
      code: ErrorCode.CASE_NOT_FOUND,
    });
  });
});

describe('clientNotice', () => {
  it('archive and restore use the case notifications', () => {
    expect(clientNotice('archive', 'c', 'r', 'u').type).toBe('case_archived');
    expect(clientNotice('restore', 'c', 'r', 'u')).toEqual({
      type: 'case_updated',
      recipientId: 'u',
      payload: { caseId: 'c', restored: 'admin' },
    });
  });
});

describe('AdminCaseManagementService.list', () => {
  it('hasReports=true narrows to reported case ids; promoted flag set', async () => {
    const row = {
      id: CASE_ID,
      title: 'T',
      status: 'open',
      client_id: 'client-1',
      practice_area_id: 'pa-1',
      primary_state_code: 'IL',
      bids_count: 2,
      comment_count: 0,
      view_count: 5,
      last_activity_at: new Date('2026-10-01T00:00:00Z'),
      created_at: new Date('2026-10-01T00:00:00Z'),
      client: { first_name: 'Ann', last_name: 'Lee' },
      practice_area: { name_en: 'Family law' },
    };
    const prisma = {
      case: { findMany: jest.fn().mockResolvedValue([row]) },
      report: {
        findMany: jest.fn().mockResolvedValue([{ target_id: CASE_ID }]),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ target_id: CASE_ID, _count: { _all: 3 } }]),
      },
      casePromotion: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { case_id: CASE_ID, ends_at: new Date(Date.now() + 86_400_000) },
          ]),
      },
    };
    const service = new AdminCaseManagementService(
      prisma as unknown as PrismaService,
      new CaseStateMachine(),
      {} as BidStateMachine,
      {} as CaseJournalService,
      {} as NotificationsService,
      {} as ChatSystemMessages,
      {} as AuditLogService,
    );
    const page = await service.list({ hasReports: true, stateCode: 'IL' });
    const where = (
      prisma.case.findMany.mock.calls[0] as [{ where: { AND: unknown[] } }]
    )[0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { id: { in: [CASE_ID] } },
        { states: { some: { state_code: 'IL' } } },
      ]),
    );
    expect(page.items[0]).toMatchObject({
      clientName: 'Ann Lee',
      practiceAreaName: 'Family law',
      openReports: 3,
      promoted: true,
    });
    expect(page.nextCursor).toBeNull();
  });
});
