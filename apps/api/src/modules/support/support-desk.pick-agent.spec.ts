import { SupportDeskService } from './support-desk.service';

/** Audit A-16: the agent pick takes a transaction-scoped advisory lock
 * BEFORE it reads the load, so tickets created together queue up and each
 * sees the previous one's assignment (no burst past `max_open`). */
describe('SupportDeskService.pickAgent', () => {
  function build(open: number, cap: number) {
    const calls: string[] = [];
    const tx = {
      $executeRaw: jest.fn(() => {
        calls.push('lock');
        return Promise.resolve(1);
      }),
      supportAgent: {
        findMany: jest.fn(() => {
          calls.push('agents');
          return Promise.resolve([{ admin_id: 'a1', max_open: cap }]);
        }),
      },
      user: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'a1',
              admin_profile: { admin_role: 'super_admin', permissions: {} },
            },
          ]),
        ),
      },
      supportTicket: {
        groupBy: jest.fn(() =>
          Promise.resolve([{ assignee_id: 'a1', _count: { _all: open } }]),
        ),
      },
    };
    const svc = new (
      SupportDeskService as unknown as new (
        ...a: unknown[]
      ) => SupportDeskService
    )(tx, {}, {}, { setContext: jest.fn() });
    return { svc, tx, calls };
  }

  it('locks first, then reads the load', async () => {
    const { svc, tx, calls } = build(0, 5);
    expect(await svc.pickAgent(tx as never)).toBe('a1');
    expect(calls).toEqual(['lock', 'agents']);
  });

  it('an agent at the cap gets nothing', async () => {
    const { svc, tx } = build(5, 5);
    expect(await svc.pickAgent(tx as never)).toBeNull();
  });
});

describe('SupportDeskService SLA alert — verify 18.11 (SU5)', () => {
  it('unassigned late tickets are mailed only to on-shift agents who can still answer', async () => {
    const prisma = {
      supportAgent: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ admin_id: 'ok' }, { admin_id: 'gone' }]),
      },
      user: {
        findMany: jest
          .fn()
          // 1st: who of the on-shift agents is an active admin
          .mockResolvedValueOnce([
            {
              id: 'ok',
              admin_profile: {
                admin_role: 'support',
                permissions: { support: 'manage' },
              },
            },
            {
              id: 'gone',
              admin_profile: { admin_role: 'moderator', permissions: {} },
            },
          ])
          // 2nd: the e-mail addresses
          .mockImplementationOnce(
            ({ where }: { where: { id: { in: string[] } } }) =>
              Promise.resolve(
                where.id.in.map((id) => ({
                  id,
                  email: `${id}@x.test`,
                  first_name: id,
                  last_name: null,
                })),
              ),
          ),
      },
      adminProfile: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const svc = new (
      SupportDeskService as unknown as new (
        ...a: unknown[]
      ) => SupportDeskService
    )(prisma, {}, {}, { setContext: jest.fn(), warn: jest.fn() }, email);
    await (svc as unknown as { alert: (t: unknown[]) => Promise<void> }).alert([
      { id: 't', assignee_id: null, subject: 'Pay', priority: 'high' },
    ]);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe('ok@x.test');
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      role: 'admin',
      status: 'active',
      deleted_at: null,
    });
  });
});
