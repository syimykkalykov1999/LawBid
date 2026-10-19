import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CaseWorkspaceService } from './case-workspace.service';

// Owner 2026-10-13: the workspace opens only for the two sides of an
// accepted case; sides have different rights on tasks.
const CLIENT = 'c1';
const ATTORNEY = 'a1';

function make(opts: {
  accepted: boolean;
  task?: Record<string, unknown>;
  status?: string;
}) {
  const prisma = {
    case: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          client_id: CLIENT,
          status: opts.status ?? 'in_progress',
          accepted_bid: opts.accepted ? { attorney_id: ATTORNEY } : null,
        }),
      ),
    },
    caseTask: {
      findFirst: jest.fn(() => Promise.resolve(opts.task ?? null)),
      update: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    attorneyTask: {
      findMany: jest.fn(() => Promise.resolve([])),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    casePhoto: { findMany: jest.fn(() => Promise.resolve([])) },
  };
  const svc = new CaseWorkspaceService(prisma as never, {} as never);
  return { svc, prisma };
}
const as = (sub: string) => ({ sub, role: 'x' }) as never;
/** An assistant working in the attorney's account (the guard swaps sub). */
const assistant = (duties: string[]) =>
  ({
    sub: ATTORNEY,
    role: 'attorney',
    assistant: { userId: 'as1', membershipId: 'm1', name: 'A', duties },
  }) as never;

describe('CaseWorkspaceService', () => {
  it('404 for a stranger, 403 before acceptance', async () => {
    await expect(
      make({ accepted: true }).svc.listFiles(as('zzz'), 'k'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      make({ accepted: false }).svc.listFiles(as(CLIENT), 'k'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      make({ accepted: false }).svc.listFiles(as(ATTORNEY), 'k'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the client cannot tick a shared task, the attorney can', async () => {
    const task = { id: 't', kind: 'shared', closed_at: null, items: [] };
    await expect(
      make({ accepted: true, task }).svc.setDone(as(CLIENT), 'k', 't', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const m = make({ accepted: true, task });
    await m.svc.setDone(as(ATTORNEY), 'k', 't', true);
    expect(m.prisma.caseTask.update).toHaveBeenCalled();
    // the planner entry of its reminder is ticked with it
    expect(m.prisma.attorneyTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { case_task_id: 't' } }),
    );
  });

  it('a for-client task: the client marks it done, only until it is closed', async () => {
    const open = { id: 't', kind: 'for_client', closed_at: null, items: [] };
    const m = make({ accepted: true, task: open });
    await m.svc.setDone(as(CLIENT), 'k', 't', true);
    expect(m.prisma.caseTask.update).toHaveBeenCalled();
    const closed = { ...open, closed_at: new Date() };
    await expect(
      make({ accepted: true, task: closed }).svc.setDone(
        as(CLIENT),
        'k',
        't',
        true,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // only the attorney takes the mark off
    await expect(
      make({ accepted: true, task: open }).svc.setDone(
        as(CLIENT),
        'k',
        't',
        false,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the client cannot add to a closed task', async () => {
    const closed = {
      id: 't',
      kind: 'for_client',
      closed_at: new Date(),
      items: [],
    };
    await expect(
      make({ accepted: true, task: closed }).svc.submit(as(CLIENT), 'k', 't', {
        note: 'x',
        files: [],
      }),
    ).rejects.toThrow('closed');
  });

  it('a task with a checklist is done only when every line is ticked', async () => {
    const task = {
      id: 't',
      kind: 'for_client',
      closed_at: null,
      items: [
        { id: 'i1', done_at: new Date() },
        { id: 'i2', done_at: null },
      ],
    };
    await expect(
      make({ accepted: true, task }).svc.setDone(as(CLIENT), 'k', 't', true),
    ).rejects.toThrow('Tick every line');
  });

  it('the attorney can attach materials to a shared task, the client cannot', async () => {
    const task = { id: 't', kind: 'shared', closed_at: null, items: [] };
    await expect(
      make({ accepted: true, task }).svc.submit(as(CLIENT), 'k', 't', {
        note: 'x',
        files: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the client sees no private tasks', async () => {
    const m = make({ accepted: true });
    const r = await m.svc.listTasks(as(CLIENT), 'k');
    expect(r.private).toEqual([]);
    expect(m.prisma.attorneyTask.findMany).not.toHaveBeenCalled();
  });

  // Audit 2026-10-19: the workspace ignored the assistant's duties.
  it('an assistant needs "cases" to open it and "tasks" to change tasks', async () => {
    await expect(
      make({ accepted: true }).svc.listFiles(assistant([]), 'k'),
    ).rejects.toMatchObject({
      response: { code: 'ASSISTANT_NOT_ALLOWED', details: { duty: 'cases' } },
    });
    await expect(
      make({ accepted: true }).svc.listFiles(assistant(['cases']), 'k'),
    ).resolves.toEqual([]);
    const task = { id: 't', kind: 'shared', closed_at: null, items: [] };
    await expect(
      make({ accepted: true, task }).svc.setDone(
        assistant(['cases']),
        'k',
        't',
        true,
      ),
    ).rejects.toMatchObject({
      response: { code: 'ASSISTANT_NOT_ALLOWED', details: { duty: 'tasks' } },
    });
    const m = make({ accepted: true, task });
    await m.svc.setDone(assistant(['cases', 'tasks']), 'k', 't', true);
    expect(m.prisma.caseTask.update).toHaveBeenCalled();
    await expect(
      make({ accepted: true }).svc.listTasks(assistant(['cases']), 'k'),
    ).resolves.toMatchObject({ canEdit: false });
  });

  it('an assistant without "cases" sees no case tasks on the board', async () => {
    const m = make({ accepted: true });
    await expect(m.svc.board(assistant(['tasks']))).resolves.toEqual([]);
    expect(m.prisma.caseTask.findMany).not.toHaveBeenCalled();
  });

  // Audit 2026-10-19: a closed case stayed editable.
  it('a closed case is read-only for both sides', async () => {
    const task = { id: 't', kind: 'joint', closed_at: null, items: [] };
    for (const status of ['closed', 'archived']) {
      const m = make({ accepted: true, task, status });
      await expect(m.svc.listFiles(as(CLIENT), 'k')).resolves.toEqual([]);
      await expect(m.svc.listTasks(as(CLIENT), 'k')).resolves.toMatchObject({
        canEdit: false,
      });
      await expect(
        m.svc.setDone(as(ATTORNEY), 'k', 't', true),
      ).rejects.toMatchObject({ response: { code: 'CASE_INVALID_STATE' } });
      await expect(
        m.svc.createUpdate(as(CLIENT), 'k', { body: 'x', files: [] }),
      ).rejects.toMatchObject({ response: { code: 'CASE_INVALID_STATE' } });
      expect(m.prisma.caseTask.update).not.toHaveBeenCalled();
    }
    // while the completion is pending or disputed, work goes on
    const m = make({ accepted: true, task, status: 'pending_completion' });
    await m.svc.setDone(as(CLIENT), 'k', 't', true);
    expect(m.prisma.caseTask.update).toHaveBeenCalled();
  });
});
