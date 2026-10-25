import { LegalRemindersJob } from './legal-reminders.job';

const NOW = new Date('2026-10-28T12:00:00Z');
const DAY = 24 * 3600 * 1000;

function build(opts: { enabled?: boolean; due?: any[]; gag?: any[] } = {}) {
  const update = jest.fn().mockResolvedValue({});
  const findMany = jest
    .fn()
    .mockResolvedValueOnce(opts.due ?? [])
    .mockResolvedValueOnce(opts.gag ?? []);
  const enqueueOpsAlert = jest.fn().mockResolvedValue(undefined);
  const job = new LegalRemindersJob(
    { dataAccessRequest: { findMany, update } } as any,
    {
      boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
      number: jest.fn().mockResolvedValue(3),
    } as any,
    {
      recipients: jest.fn().mockResolvedValue([
        { userId: 'adm1', email: 'a@example.com', lang: 'en' },
        { userId: 'adm2', email: null, lang: 'en' },
      ]),
    } as any,
    { enqueueOpsAlert } as any,
    { setContext: jest.fn(), info: jest.fn() } as any,
  );
  return { job, update, enqueueOpsAlert, findMany };
}

describe('LegalRemindersJob', () => {
  it('does nothing when switched off', async () => {
    const { job, findMany } = build({ enabled: false });
    expect(await job.run(NOW)).toEqual({
      due: 0,
      gagEnding: 0,
      alertsQueued: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('alerts every on-call admin about a request due soon and stamps it', async () => {
    const { job, update, enqueueOpsAlert } = build({
      due: [
        {
          id: 'r1',
          reference_number: 'GJ-1',
          agency: 'Court',
          due_at: new Date(+NOW + DAY),
        },
      ],
    });
    const res = await job.run(NOW);
    expect(res.due).toBe(1);
    expect(enqueueOpsAlert).toHaveBeenCalledTimes(2);
    expect(enqueueOpsAlert.mock.calls[0][0].title).toContain('due soon');
    expect(update.mock.calls[0][0].data.last_reminded_at).toEqual(NOW);
  });

  it('says overdue for a missed due date', async () => {
    const { job, enqueueOpsAlert } = build({
      due: [
        {
          id: 'r1',
          reference_number: 'GJ-1',
          agency: 'Court',
          due_at: new Date(+NOW - DAY),
        },
      ],
    });
    await job.run(NOW);
    expect(enqueueOpsAlert.mock.calls[0][0].title).toContain('overdue');
  });

  it('reminds when a gag order ends (tell the user) and stamps it', async () => {
    const { job, update, enqueueOpsAlert } = build({
      gag: [
        {
          id: 'r2',
          reference_number: 'GJ-2',
          agency: 'Court',
          nondisclosure_until: new Date(+NOW - 1000),
        },
      ],
    });
    const res = await job.run(NOW);
    expect(res.gagEnding).toBe(1);
    expect(enqueueOpsAlert.mock.calls[0][0].title).toContain('tell the user');
    expect(update.mock.calls[0][0].data.nondisclosure_reminded_at).toEqual(NOW);
  });

  it('selects only open requests, once a day', async () => {
    const { job, findMany } = build();
    await job.run(NOW);
    const dueWhere = findMany.mock.calls[0][0].where;
    expect(dueWhere.status).toEqual({ in: ['received', 'in_progress'] });
    expect(dueWhere.OR[1].last_reminded_at.lt).toEqual(new Date(+NOW - DAY));
    expect(findMany.mock.calls[1][0].where.user_notified_at).toBeNull();
  });
});
