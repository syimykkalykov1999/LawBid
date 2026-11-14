import type { Case } from '../../../generated/prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { CaseStateMachine } from '../domain/case-state-machine';
import { CaseLifecycleService } from './case-lifecycle.service';

/**
 * R-392 (owner 2026-11-04): closing a case in work takes both sides —
 * either side asks («Закрыть кейс»), the other confirms or keeps it open
 * («Не закрывать»); no answer in `cases.close_confirm_days` → auto-close.
 * Every step: a system line in the case chat (both see it) and the bell /
 * push via NotificationsService.emit.
 */
const CASE = 'c0000000-0000-4000-8000-000000000001';
const CLIENT = 'u0000000-0000-4000-8000-0000000000c1';
const ATTORNEY = 'u0000000-0000-4000-8000-0000000000a1';
const client = { sub: CLIENT, role: 'client' } as RequestUser;
const attorney = { sub: ATTORNEY, role: 'attorney' } as RequestUser;

function setup(closeConfirmDays = 7) {
  const row = {
    id: CASE,
    client_id: CLIENT,
    status: 'in_progress',
    version: 1,
    client_completed_at: null as Date | null,
    attorney_confirmed_at: null as Date | null,
    auto_close_at: null as Date | null,
    accepted_bid: { attorney_id: ATTORNEY },
  };
  const tx = {
    case: {
      findUnique: jest.fn(() => Promise.resolve({ ...row })),
      findFirstOrThrow: jest.fn(() =>
        Promise.resolve({ ...row } as unknown as Case),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { status: string };
          data: Record<string, unknown>;
        }) => {
          if (where.status !== row.status) {
            return Promise.resolve({ count: 0 });
          }
          for (const [k, v] of Object.entries(data)) {
            if (k !== 'version') (row as Record<string, unknown>)[k] = v;
          }
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    $queryRaw: jest.fn(() => Promise.resolve([{ ...row }])),
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
  };
  const journal = { append: jest.fn() };
  const notifications = { emit: jest.fn() };
  const reviews = { requestReview: jest.fn() };
  const chat = {
    post: jest.fn(() =>
      Promise.resolve([{ conversationId: 'conv', userIds: [] }]),
    ),
    publish: jest.fn(),
  };
  const settings = {
    number: jest.fn(() => Promise.resolve(closeConfirmDays)),
  };
  const service = new CaseLifecycleService(
    prisma as never,
    new CaseStateMachine(),
    {} as never,
    journal as never,
    notifications as never,
    reviews as never,
    {} as never,
    chat as never,
    settings as never,
  );
  const emitted = () =>
    notifications.emit.mock.calls.map(
      ([n]: [{ type: string; recipientId: string; payload: object }][]) => n,
    ) as unknown as {
      type: string;
      recipientId: string;
      payload: Record<string, unknown>;
    }[];
  const chatKeys = () =>
    (chat.post.mock.calls as unknown as [unknown, unknown, string][]).map(
      (c) => c[2],
    );
  return { row, service, journal, chat, emitted, chatKeys, settings };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { getResponse(): { code: string } }).getResponse().code;
  }
  return null;
};

describe('CaseLifecycleService — R-392 two-sided closing', () => {
  it('request: the other side gets the bell, both see the chat line, the wait is the admin setting', async () => {
    const t = setup(3);
    const before = Date.now();
    await t.service.complete(client, CASE);
    expect(t.row.status).toBe('pending_completion');
    expect(t.row.client_completed_at).toBeInstanceOf(Date);
    const wait = t.row.auto_close_at!.getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(3 * 86_400_000 - 1000);
    expect(wait).toBeLessThan(3 * 86_400_000 + 5000);
    expect(t.settings.number).toHaveBeenCalledWith('cases.close_confirm_days');
    expect(t.emitted()).toEqual([
      expect.objectContaining({
        type: 'completion_requested',
        recipientId: ATTORNEY,
        payload: expect.objectContaining({ by: 'client', actorId: CLIENT }),
      }),
    ]);
    expect(t.chatKeys()).toEqual(['close_requested_client']);
    expect(t.chat.publish).toHaveBeenCalledTimes(1);
  });

  it('request → confirm: closed, case_closed to BOTH sides and «Кейс закрыт» in chat', async () => {
    const t = setup();
    await t.service.complete(attorney, CASE);
    expect(t.chatKeys()).toEqual(['close_requested_attorney']);
    await t.service.confirmCompletion(client, CASE);
    expect(t.row.status).toBe('closed');
    const closed = t.emitted().filter((n) => n.type === 'case_closed');
    expect(closed.map((n) => n.recipientId).sort()).toEqual(
      [ATTORNEY, CLIENT].sort(),
    );
    expect(t.chatKeys()).toEqual(['close_requested_attorney', 'case_closed']);
  });

  it('request → «Не закрывать»: back in work, the requester is told, both see the chat line', async () => {
    const t = setup();
    await t.service.complete(client, CASE);
    await t.service.declineCompletion(attorney, CASE);
    expect(t.row.status).toBe('in_progress');
    expect(t.row.client_completed_at).toBeNull();
    expect(t.row.auto_close_at).toBeNull();
    expect(t.emitted()[1]).toEqual(
      expect.objectContaining({
        type: 'case_workspace_activity',
        recipientId: CLIENT,
        payload: expect.objectContaining({
          kind: 'close_declined',
          actorId: ATTORNEY,
        }),
      }),
    );
    expect(t.chatKeys()).toEqual([
      'close_requested_client',
      'close_declined_attorney',
    ]);
    expect(t.journal.append).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ event: 'completion_declined' }),
    );
    // The case can be asked to close again afterwards.
    await t.service.complete(attorney, CASE);
    expect(t.row.status).toBe('pending_completion');
  });

  it('the requester cannot answer their own request', async () => {
    const t = setup();
    await t.service.complete(client, CASE);
    expect(await codeOf(t.service.declineCompletion(client, CASE))).toBe(
      ErrorCode.CASE_INVALID_STATE,
    );
    expect(await codeOf(t.service.confirmCompletion(client, CASE))).toBe(
      ErrorCode.CASE_INVALID_STATE,
    );
    expect(t.row.status).toBe('pending_completion');
  });

  it('a stranger gets CASE_NOT_FOUND', async () => {
    const t = setup();
    await t.service.complete(client, CASE);
    const stranger = { sub: 'someone', role: 'attorney' } as RequestUser;
    expect(await codeOf(t.service.declineCompletion(stranger, CASE))).toBe(
      ErrorCode.CASE_NOT_FOUND,
    );
  });

  it('no answer in time → the cron auto-closes, both sides are told', async () => {
    const t = setup(1);
    await t.service.complete(attorney, CASE);
    // Not yet due.
    expect(await t.service.autoClose(CASE, new Date())).toBe(false);
    const later = new Date(t.row.auto_close_at!.getTime() + 1000);
    expect(await t.service.autoClose(CASE, later)).toBe(true);
    expect(t.row.status).toBe('closed');
    expect(
      t
        .emitted()
        .filter((n) => n.type === 'case_closed')
        .map((n) => n.recipientId)
        .sort(),
    ).toEqual([ATTORNEY, CLIENT].sort());
    expect(t.chatKeys()).toEqual(['close_requested_attorney', 'case_closed']);
  });
});
