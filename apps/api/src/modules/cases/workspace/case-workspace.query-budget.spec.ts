import { countingPrisma } from '../../../prisma/query-counter.test-support';
import {
  CaseHistoryService,
  TIMELINE_MAX,
} from '../../case-history/case-history.service';
import { FilesService } from '../../files/files.service';
import {
  CaseWorkspaceService,
  WORKSPACE_LIST_MAX,
} from './case-workspace.service';

/**
 * Data-layer audit 2026-11-04 (R-395): the case workspace tabs and the case
 * timeline read a bounded number of rows and a fixed number of queries,
 * however long the case is.
 */
const CLIENT = 'c1';
const ATTORNEY = 'a1';
const as = (sub: string) => ({ sub, role: 'x' }) as never;

function workspace() {
  const q = countingPrisma({
    'case.findFirst': {
      client_id: CLIENT,
      status: 'in_progress',
      accepted_bid: { attorney_id: ATTORNEY },
    },
    'user.findMany': [
      { id: CLIENT, first_name: 'C', last_name: 'L', avatar_file_id: 'fc' },
      { id: ATTORNEY, first_name: 'A', last_name: 'T', avatar_file_id: 'fa' },
    ],
  });
  const files = {
    casePhotoUrls: jest.fn(() => Promise.resolve([])),
    mediaUrl: jest.fn(() => Promise.resolve('u')),
    mediaUrlsMany: jest.fn(() =>
      Promise.resolve(
        new Map([
          ['fc', 'uc'],
          ['fa', 'ua'],
        ]),
      ),
    ),
  };
  const svc = new CaseWorkspaceService(
    q.prisma as never,
    files as never,
    { emit: jest.fn() } as never,
  );
  return { svc, q, files };
}

describe('Case workspace query budget', () => {
  it('activity: 5 queries, newest 200 per source, one avatar lookup', async () => {
    const { svc, q, files } = workspace();
    await svc.activity(as(CLIENT), 'k1');
    // case + updates + task events + people (users, licenses).
    // Before: + one file query per person (N+1 on avatars).
    expect(q.count()).toBe(5);
    expect(files.mediaUrl).not.toHaveBeenCalled();
    expect(files.mediaUrlsMany).toHaveBeenCalledTimes(1);
    for (const m of ['caseUpdate.findMany', 'caseTaskEvent.findMany']) {
      const call = q.log.find((e) => `${e.model}.${e.method}` === m);
      expect(call?.args).toMatchObject({
        take: WORKSPACE_LIST_MAX,
        orderBy: { created_at: 'desc' },
      });
    }
  });

  it('updates: newest 200 updates and task events, the list stays ≤ 200', async () => {
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i));
    const many = (n: number, extra: object) =>
      Array.from({ length: n }, (_, i) => ({
        id: `x${i}`,
        author_id: CLIENT,
        actor_id: CLIENT,
        body: 'b',
        note: null,
        type: 'done',
        task_id: 't',
        task: { title: 'T', id: 't' },
        created_at: at(i),
        ...extra,
      }));
    const svc = new CaseWorkspaceService(
      countingPrisma({
        'case.findFirst': {
          client_id: CLIENT,
          status: 'in_progress',
          accepted_bid: { attorney_id: ATTORNEY },
        },
        'caseUpdate.findMany': many(WORKSPACE_LIST_MAX, {}),
        'caseTaskEvent.findMany': many(WORKSPACE_LIST_MAX, {}),
      }).prisma as never,
      {
        casePhotoUrls: jest.fn(() => Promise.resolve([])),
        mediaUrlsMany: jest.fn(() => Promise.resolve(new Map())),
      } as never,
      { emit: jest.fn() } as never,
    );
    const out = await svc.listUpdates(as(CLIENT), 'k1');
    // 200 updates + 200 task events are merged, newest 200 returned.
    expect(out).toHaveLength(WORKSPACE_LIST_MAX);
  });

  it('tasks: newest 200 shared tasks and 200 private ones', async () => {
    const { svc, q } = workspace();
    await svc.listTasks(as(ATTORNEY), 'k1');
    const tasks = q.log.find((e) => e.model === 'caseTask');
    const priv = q.log.find((e) => e.model === 'attorneyTask');
    expect(tasks?.args).toMatchObject({ take: WORKSPACE_LIST_MAX });
    expect(priv?.args).toMatchObject({ take: WORKSPACE_LIST_MAX });
  });
});

describe('Case timeline query budget', () => {
  it('reads the newest 500 journal rows and returns them oldest first', async () => {
    const rows = [3, 2, 1].map((i) => ({
      id: `e${i}`,
      event_type: 'case_created',
      created_at: new Date(Date.UTC(2026, 0, i)),
      actor_role: 'client',
      payload: {},
    }));
    const q = countingPrisma({ 'caseJournal.findMany': rows });
    const svc = Object.create(CaseHistoryService.prototype) as {
      events(u: unknown, id: string): Promise<{ id: string }[]>;
    };
    Object.assign(svc, { prisma: q.prisma });
    const out = await svc.events(as(CLIENT), 'k1');
    expect(q.count()).toBe(1);
    expect(q.log[0].args).toMatchObject({
      take: TIMELINE_MAX,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    expect(out.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('FilesService.mediaUrlsMany', () => {
  it('one query for any number of files (was one per file)', async () => {
    const q = countingPrisma({
      'file.findMany': [{ id: 'f1' }, { id: 'f2' }],
    });
    const svc = Object.create(FilesService.prototype) as FilesService;
    Object.assign(svc, {
      prisma: q.prisma,
      mediaUrlOf: (f: { id: string }) => Promise.resolve(`u:${f.id}`),
    });
    const out = await svc.mediaUrlsMany(['f1', 'f2', 'f1', null]);
    expect(q.count()).toBe(1);
    expect(q.log[0].args).toEqual({ where: { id: { in: ['f1', 'f2'] } } });
    expect([...out.entries()]).toEqual([
      ['f1', 'u:f1'],
      ['f2', 'u:f2'],
    ]);
    expect((await svc.mediaUrlsMany([null])).size).toBe(0);
    expect(q.count()).toBe(1);
  });
});
