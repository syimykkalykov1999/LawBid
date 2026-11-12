import { GithubMergeError } from '../admin-launch/infra-github';
import {
  AiAssistantError,
  AiAssistantService,
  AiPullError,
} from './ai-assistant.service';

const SHA = 'a'.repeat(40);
const PR_URL = 'https://github.com/o/r/pull/9';
function aiPull(over: Record<string, unknown> = {}) {
  return {
    number: 9,
    title: 'fix: crash on the case screen',
    body: '## What\nCrash\n## Why\nnull title',
    url: PR_URL,
    state: 'open',
    merged: false,
    draft: false,
    headRef: 'ai/issue-7',
    headRepo: 'o/r',
    headSha: SHA,
    baseRef: 'main',
    createdAt: '2026-11-12T01:00:00Z',
    ...over,
  };
}

function make(
  o: {
    mode?: string;
    connected?: boolean;
    spent?: string | null;
    settings?: unknown;
  } = {},
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
    eval: jest.fn((_s: string, _n: number, k: string, token: string) => {
      if (store.get(k) === token) store.delete(k);
      return Promise.resolve(1);
    }),
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
    openPullsByPrefix: jest.fn(() =>
      Promise.resolve({ repo: 'o/r', pulls: [aiPull()] }),
    ),
    pull: jest.fn(() => Promise.resolve({ repo: 'o/r', pull: aiPull() })),
    commitChecks: jest.fn(() =>
      Promise.resolve({
        runs: [
          {
            name: 'API',
            status: 'completed',
            conclusion: 'success',
          },
        ],
        statuses: [] as { context: string; state: string }[],
      }),
    ),
    pullFiles: jest.fn(() =>
      Promise.resolve({
        files: [
          {
            filename: 'apps/api/src/modules/cases/cases.service.ts',
            previousFilename: null as string | null,
            patch: '+x',
          },
        ],
        complete: true,
      }),
    ),
    mergePull: jest.fn(() => Promise.resolve({ sha: 'b'.repeat(40) })),
    closePull: jest.fn<Promise<void>, [number, string]>(() =>
      Promise.resolve(),
    ),
    deleteBranch: jest.fn((ref: string) => Promise.resolve(ref.length > 0)),
  };
  // Owner 2026-11-12 (row 48): the owner's pictures (a fake of the service).
  const attachments = {
    prepareTask: jest.fn((_owner: string, files: string[]) =>
      Promise.resolve(
        files.map((_f, i) => `0000000${i}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`),
      ),
    ),
    bindTask: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve()),
    closeTasks: jest.fn(() => Promise.resolve(1)),
    taskImages: jest.fn(() =>
      Promise.resolve({
        images: [{ id: 'att-1', mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
        pending: 0,
      }),
    ),
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
    (o.settings ?? settings) as never,
    prisma as never,
    audit as never,
    redis as never,
    sentry as never,
    attachments as never,
  );
  return { svc, github, audit, redis, store, prisma, attachments };
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

  it('owner 12.11: Авто takes no admin task (only Вкл does), the page says why', async () => {
    const auto = make({ mode: 'auto' });
    await expect(
      auto.svc.createTask({ id: 'a' }, { title: 'Fix it', details: 'Details' }),
    ).rejects.toThrow('Режим «Авто»');
    expect(auto.github.createIssue).not.toHaveBeenCalled();
    const s = await auto.svc.status(NOW);
    expect(s.allowed).toBe(true);
    expect(s.tasksAllowed).toBe(false);
    expect(s.tasksReason).toContain('Вкл');
    expect((await make({ mode: 'on' }).svc.status(NOW)).tasksAllowed).toBe(
      true,
    );
  });

  it('lists the AI PRs with CI state, what/why and the reported cost', async () => {
    const { svc } = make();
    await svc.report(
      { runUrl: 'u' },
      { kind: 'task', costUsd: 0.4, prUrl: PR_URL },
      NOW,
    );
    const r = await svc.pulls();
    expect(r.error).toBeNull();
    expect(r.pulls[0]).toMatchObject({
      number: 9,
      headSha: SHA,
      checks: 'success',
      costUsd: 0.4,
      branch: 'ai/issue-7',
    });
    expect(r.pulls[0].summary).toContain('## Why');
  });

  it('«Разрешить» merges squash, pinned to the sha the owner saw, and writes the audit row', async () => {
    const { svc, github, audit, store } = make();
    const r = await svc.approvePull({ id: 'admin-1' }, 9, SHA);
    expect(r).toEqual({ number: 9, mergedSha: 'b'.repeat(40) });
    expect(github.mergePull).toHaveBeenCalledWith(9, SHA, expect.any(String));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai.pull_merge' }),
    );
    expect(store.has('ai:merge:lock')).toBe(false);
  });

  it('refuses: new commits since the owner looked, CI not green, a forbidden file, a fork, another merge running', async () => {
    const stale = make();
    await expect(
      stale.svc.approvePull({ id: 'a' }, 9, 'c'.repeat(40)),
    ).rejects.toMatchObject({ reason: 'stale_sha' });

    const red = make();
    red.github.commitChecks.mockResolvedValueOnce({
      runs: [
        { name: 'API', status: 'completed', conclusion: 'success' },
        {
          name: 'e2e',
          status: 'in_progress',
          conclusion: null as unknown as string,
        },
      ],
      statuses: [],
    });
    await expect(red.svc.approvePull({ id: 'a' }, 9, SHA)).rejects.toThrow(
      'CI',
    );

    const bad = make();
    bad.github.pullFiles.mockResolvedValueOnce({
      files: [
        {
          filename: '.github/workflows/deploy.yml',
          previousFilename: null,
          patch: '+x',
        },
      ],
      complete: true,
    });
    await expect(
      bad.svc.approvePull({ id: 'a' }, 9, SHA),
    ).rejects.toMatchObject({ reason: 'guard' });

    const fork = make();
    fork.github.pull.mockResolvedValueOnce({
      repo: 'o/r',
      pull: aiPull({ headRepo: 'evil/r' }),
    });
    await expect(
      fork.svc.approvePull({ id: 'a' }, 9, SHA),
    ).rejects.toMatchObject({ reason: 'not_ai' });

    const busy = make();
    busy.store.set('ai:merge:lock', 'someone-else');
    await expect(
      busy.svc.approvePull({ id: 'a' }, 9, SHA),
    ).rejects.toMatchObject({ reason: 'busy' });
    expect(busy.store.get('ai:merge:lock')).toBe('someone-else');

    for (const m of [stale, red, bad, fork, busy]) {
      expect(m.github.mergePull).not.toHaveBeenCalled();
      expect(m.audit.record).not.toHaveBeenCalled();
    }
  });

  it('GitHub moved the branch during the merge: told as «new changes», lock released', async () => {
    const m = make();
    m.github.mergePull.mockRejectedValueOnce(
      new GithubMergeError(409, 'Head branch was modified.'),
    );
    const e = (await m.svc
      .approvePull({ id: 'a' }, 9, SHA)
      .catch((x: unknown) => x)) as AiPullError;
    expect(e).toBeInstanceOf(AiPullError);
    expect(e.reason).toBe('stale_sha');
    expect(m.store.has('ai:merge:lock')).toBe(false);
  });

  it('«Отклонить» closes the PR with a comment and an audit row', async () => {
    const { svc, github, audit } = make();
    await svc.rejectPull({ id: 'a' }, 9, 'not needed, ask bob@example.com');
    const [n, comment] = github.closePull.mock.calls[0];
    expect(n).toBe(9);
    expect(comment).toContain('Отклонено владельцем');
    expect(comment).not.toContain('bob@example.com');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai.pull_reject' }),
    );
    const other = make();
    other.github.pull.mockResolvedValueOnce({
      repo: 'o/r',
      pull: aiPull({ headRef: 'feature/x' }),
    });
    await expect(other.svc.rejectPull({ id: 'a' }, 9)).rejects.toMatchObject({
      reason: 'not_ai',
    });
    expect(other.github.closePull).not.toHaveBeenCalled();
  });

  // ------------------------------------------------- owner 2026-11-12 (48, 49, 55)

  it('a task with pictures: the PUBLIC issue gets only opaque ids, no URL and no bytes', async () => {
    const { svc, github, attachments, audit } = make();
    const files = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    await svc.createTask(
      { id: 'admin-uuid-1' },
      { title: 'Fix it', details: 'See the screenshots', imageFileIds: files },
    );
    expect(attachments.prepareTask).toHaveBeenCalledWith('admin-uuid-1', files);
    const body = (
      github.createIssue.mock.calls[0] as unknown as [{ body: string }]
    )[0].body;
    expect(body).toContain(
      'AI attachments: 00000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa 00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    // No link of any kind, no file id of the owner's upload, no base64.
    expect(body).not.toMatch(/https?:\/\//);
    expect(body).not.toContain(files[0]);
    expect(body).not.toMatch(/[A-Za-z0-9+/]{80,}/);
    expect(attachments.bindTask).toHaveBeenCalledWith(
      [
        '00000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ],
      42,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ images: 2 }),
      }),
    );
  });

  it('a task without pictures has no attachments line', async () => {
    const { svc, github, attachments } = make();
    await svc.createTask({ id: 'a' }, { title: 'Fix it', details: 'Plain' });
    expect(attachments.prepareTask).not.toHaveBeenCalled();
    const body = (
      github.createIssue.mock.calls[0] as unknown as [{ body: string }]
    )[0].body;
    expect(body).not.toContain('AI attachments:');
  });

  it('the issue could not be opened: the prepared pictures are closed (cleanup takes them)', async () => {
    const m = make();
    m.github.createIssue.mockRejectedValueOnce(new Error('HTTP 500'));
    await expect(
      m.svc.createTask(
        { id: 'a' },
        {
          title: 'Fix it',
          details: 'x',
          imageFileIds: ['11111111-1111-4111-8111-111111111111'],
        },
      ),
    ).rejects.toThrow('HTTP 500');
    expect(m.attachments.close).toHaveBeenCalledWith([
      '00000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
    expect(m.attachments.bindTask).not.toHaveBeenCalled();
  });

  it('the workflow gets the pictures as base64 with a safe extension', async () => {
    const { svc, attachments } = make();
    const r = await svc.taskImages(7, ['att-1']);
    expect(attachments.taskImages).toHaveBeenCalledWith(7, ['att-1']);
    expect(r).toEqual({
      images: [
        { id: 'att-1', mime: 'image/png', ext: 'png', base64: 'iVBORw0KGgo=' },
      ],
      pending: 0,
    });
  });

  it('«Разрешить» also deletes the merged ai/ branch and closes the task pictures', async () => {
    const { svc, github, attachments } = make();
    await svc.approvePull({ id: 'admin-1' }, 9, SHA);
    expect(github.deleteBranch).toHaveBeenCalledWith('ai/issue-7');
    expect(attachments.closeTasks).toHaveBeenCalledWith([7]);
  });

  it('«Отклонить» closes the PR AND deletes its branch', async () => {
    const { svc, github, attachments } = make();
    await svc.rejectPull({ id: 'a' }, 9, 'no');
    expect(github.closePull).toHaveBeenCalled();
    expect(github.deleteBranch).toHaveBeenCalledWith('ai/issue-7');
    expect(attachments.closeTasks).toHaveBeenCalledWith([7]);
  });

  it('a branch that cannot be deleted does not undo the merge', async () => {
    const m = make();
    m.github.deleteBranch.mockRejectedValueOnce(new Error('HTTP 403'));
    await expect(m.svc.approvePull({ id: 'a' }, 9, SHA)).resolves.toEqual({
      number: 9,
      mergedSha: 'b'.repeat(40),
    });
  });

  it('a closed task issue on the page closes its pictures', async () => {
    const m = make();
    m.github.issuesWithPulls.mockResolvedValueOnce([
      {
        number: 5,
        title: 't',
        state: 'closed',
        url: 'u',
        createdAt: 'x',
        pulls: [],
      },
      {
        number: 6,
        title: 't',
        state: 'open',
        url: 'u',
        createdAt: 'x',
        pulls: [],
      },
    ] as never);
    await m.svc.status(NOW);
    expect(m.attachments.closeTasks).toHaveBeenCalledWith([5]);
  });

  it("model: Opus 5.5 by default; the owner's setting is used; an unknown id never reaches the workflow", async () => {
    const def = make();
    expect((await def.svc.gate(NOW, 'task')).model).toBe('claude-opus-5-5');
    expect((await def.svc.status(NOW)).models).toEqual([
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
    ]);
    const pick = (model: string) =>
      make({
        settings: {
          string: jest.fn((k: string) =>
            Promise.resolve(k === 'ai.assistant_model' ? model : 'on'),
          ),
          number: jest.fn(() => Promise.resolve(30)),
        },
      });
    expect((await pick('claude-sonnet-5-5').svc.gate(NOW, 'task')).model).toBe(
      'claude-sonnet-5-5',
    );
    expect(
      (await pick('claude-opus-5-5; rm -rf /').svc.gate(NOW, 'task')).model,
    ).toBe('claude-opus-5-5');
  });
});
