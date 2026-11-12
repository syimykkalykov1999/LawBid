import { AiAssistantError, AiAssistantService } from './ai-assistant.service';

function make(
  o: { mode?: string; connected?: boolean; spent?: string | null } = {},
) {
  const store = new Map<string, string>();
  if (o.spent !== undefined && o.spent !== null)
    store.set('ai:usd:2026-11', o.spent);
  const list: string[] = [];
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    incrbyfloat: jest.fn((k: string, v: number) => {
      store.set(k, String(Number(store.get(k) ?? 0) + v));
      return Promise.resolve(store.get(k));
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    lpush: jest.fn((_k: string, v: string) => {
      list.unshift(v);
      return Promise.resolve(list.length);
    }),
    ltrim: jest.fn(() => Promise.resolve('OK')),
    lrange: jest.fn(() => Promise.resolve([...list])),
    set: jest.fn((k: string, v: string) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
  };
  const github = {
    configured: jest.fn(() => Promise.resolve(o.connected ?? true)),
    createIssue: jest.fn(() =>
      Promise.resolve({
        number: 42,
        url: 'https://github.com/o/r/issues/42',
        repo: 'o/r',
      }),
    ),
    issuesWithPulls: jest.fn(() => Promise.resolve([])),
    dispatchWorkflow: jest.fn(() => Promise.resolve({ repo: 'o/r' })),
  };
  const settings = {
    string: jest.fn(() => Promise.resolve(o.mode ?? 'on')),
    number: jest.fn(() => Promise.resolve(30)),
  };
  const prisma = {
    systemIncident: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            component: 'alarm:queue-backlog',
            severity: 'red',
            title: 'lawbid-prod-queue-backlog for bob@example.com',
            opened_at: new Date('2026-11-09T01:00:00Z'),
          },
        ]),
      ),
    },
    supportTicket: {
      groupBy: jest.fn(() =>
        Promise.resolve([{ category: 'bug', _count: { _all: 3 } }]),
      ),
    },
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const sentry = {
    read: jest.fn(() =>
      Promise.resolve({
        issues: [
          {
            id: '1',
            title: 'TypeError at /cases for anna@example.com',
            count: 7,
            users: 2,
            firstSeen: 'x',
            lastSeen: '2026-11-09T00:00:00Z',
            permalink: 'https://sentry.io/i/1',
          },
        ],
      }),
    ),
  };
  const svc = new AiAssistantService(
    github as never,
    settings as never,
    prisma as never,
    audit as never,
    redis as never,
    sentry as never,
  );
  return { svc, github, audit, redis, store, prisma };
}

const NOW = new Date('2026-11-09T02:00:00Z');

describe('AiAssistantService', () => {
  it('a task becomes an ai-task issue and an audit row', async () => {
    const { svc, github, audit } = make();
    const r = await svc.createTask(
      { id: 'admin-uuid-1' },
      { title: 'Fix it', details: 'The case screen crashes' },
    );
    expect(r.number).toBe(42);
    expect(github.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['ai-task'], title: 'Fix it' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai.task_create' }),
    );
  });

  it('switched off or not connected: no issue is opened, honest reason', async () => {
    const off = make({ mode: 'off' });
    await expect(
      off.svc.createTask({ id: 'a' }, { title: 't', details: 'd' }),
    ).rejects.toBeInstanceOf(AiAssistantError);
    expect(off.github.createIssue).not.toHaveBeenCalled();
    const nc = make({ connected: false });
    await expect(
      nc.svc.createTask({ id: 'a' }, { title: 't', details: 'd' }),
    ).rejects.toThrow('Не подключено');
    const s = await nc.svc.status(NOW);
    expect(s.connected).toBe(false);
    expect(s.reason).toContain('Не подключено');
    expect(nc.github.issuesWithPulls).not.toHaveBeenCalled();
  });

  it('reported costs add up and close the gate at the ceiling', async () => {
    const { svc } = make({ spent: '29.5' });
    expect((await svc.gate(NOW)).allowed).toBe(true);
    await svc.report(
      { runUrl: 'https://github.com/o/r/actions/runs/1' },
      { kind: 'schedule', costUsd: 0.75, conclusion: 'success' },
      NOW,
    );
    const g = await svc.gate(NOW);
    expect(g.allowed).toBe(false);
    expect(g.reason).toBe('budget');
    const s = await svc.status(NOW);
    expect(s.runs[0]).toMatchObject({
      kind: 'schedule',
      costUsd: 0.75,
      conclusion: 'success',
    });
  });

  it('only a real PR link is kept', async () => {
    const { svc } = make();
    await svc.report(
      { runUrl: 'u' },
      { kind: 'task', prUrl: 'https://evil.example/pull/1' },
      NOW,
    );
    await svc.report(
      { runUrl: 'u' },
      { kind: 'task', issueNumber: 42, prUrl: 'https://github.com/o/r/pull/7' },
      NOW,
    );
    const runs = (await svc.status(NOW)).runs;
    expect(runs[0].prUrl).toBe('https://github.com/o/r/pull/7');
    expect(runs[1].prUrl).toBeNull();
  });

  it('the digest carries no personal data: scrubbed titles, ticket counts only', async () => {
    const { svc } = make();
    const d = await svc.digest(NOW);
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/@example\.com/);
    expect(d.openTicketsByCategory).toEqual({ bug: 3 });
    expect(d.sentry[0]).toMatchObject({ count: 7, users: 2 });
    expect(d.alarms[0].component).toBe('alarm:queue-backlog');
  });

  describe('trigger (12.11.2026: react at once to alarms and new errors)', () => {
    it('dispatches ai-assistant.yml with scrubbed inputs, once an hour per key', async () => {
      const { svc, github, redis } = make();
      expect(
        await svc.trigger(
          'alarm',
          'lawbid-prod-api-5xx',
          'lawbid-prod-api-5xx bob@example.com',
        ),
      ).toBe('dispatched');
      expect(github.dispatchWorkflow).toHaveBeenCalledWith('ai-assistant.yml', {
        reason: 'alarm',
        alarm: 'lawbid-prod-api-5xx [email]',
      });
      expect(redis.set).toHaveBeenCalledWith(
        'ai:trigger:alarm:lawbid-prod-api-5xx',
        '1',
        'EX',
        3600,
        'NX',
      );
      expect(await svc.trigger('alarm', 'lawbid-prod-api-5xx', 'again')).toBe(
        'debounced',
      );
      expect(await svc.trigger('sentry', '123', 'error: boom')).toBe(
        'dispatched',
      );
      expect(github.dispatchWorkflow).toHaveBeenLastCalledWith(
        'ai-assistant.yml',
        { reason: 'sentry', issue: 'error: boom' },
      );
      expect(github.dispatchWorkflow).toHaveBeenCalledTimes(2);
    });

    it('respects the gate: off, not connected or over the ceiling = nothing', async () => {
      for (const o of [
        { mode: 'off' },
        { connected: false },
        { spent: '30' },
      ]) {
        const { svc, github, redis } = make(o);
        expect(await svc.trigger('alarm', 'a', 'a')).toBe('gated');
        expect(github.dispatchWorkflow).not.toHaveBeenCalled();
        expect(redis.set).not.toHaveBeenCalled();
      }
    });

    it('a failed dispatch frees the key so the next alarm tries again, never throws', async () => {
      const { svc, github, store } = make();
      github.dispatchWorkflow.mockRejectedValueOnce(new Error('HTTP 502'));
      expect(await svc.trigger('alarm', 'x', 'x')).toBe('failed');
      expect(store.has('ai:trigger:alarm:x')).toBe(false);
      expect(await svc.trigger('alarm', 'x', 'x')).toBe('dispatched');
    });
  });
});
