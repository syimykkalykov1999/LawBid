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
