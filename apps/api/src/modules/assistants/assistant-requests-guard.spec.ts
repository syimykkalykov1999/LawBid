/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { AssistantsService } from './assistants.service';

/**
 * R2B-2 + R2B-11 (detective R2, 14.11): an assistant's request is checked
 * with the real DTO rules at filing and at approval, and approving it twice
 * (double tap, two devices) applies it once.
 */
type Row = {
  id: string;
  attorney_id: string;
  membership_id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  result_id: string | null;
};

function world(row: Partial<Row> = {}) {
  const r: Row = {
    id: 'r1',
    attorney_id: 'att',
    membership_id: 'm1',
    kind: 'post',
    payload: { title: 'Hello', body: 'Text' },
    status: 'pending',
    result_id: null,
    ...row,
  };
  const prisma = {
    assistantRequest: {
      // Both taps read the row while it is still pending (the race).
      findFirst: jest.fn(async () => ({ ...r, status: 'pending' })),
      create: jest.fn(async () => ({ id: 'r1' })),
      update: jest.fn(async (q: { data: Partial<Row> }) => {
        Object.assign(r, q.data);
        return r;
      }),
      updateMany: jest.fn(
        async (q: { where: { status?: string }; data: Partial<Row> }) => {
          if (q.where.status && q.where.status !== r.status) {
            return { count: 0 };
          }
          Object.assign(r, q.data);
          return { count: 1 };
        },
      ),
    },
  };
  const posts = { create: jest.fn(async () => ({ id: 'p1' })) };
  const profiles = { updateOwn: jest.fn(async () => ({})) };
  const svc = Object.create(AssistantsService.prototype) as AssistantsService;
  Object.assign(svc, {
    prisma,
    posts,
    profiles,
    comments: { create: jest.fn(async () => ({ id: 'c1' })) },
    caseComments: { create: jest.fn(async () => ({ id: 'cc1' })) },
    notifications: { emit: jest.fn(async () => undefined) },
    log: jest.fn(async () => undefined),
    tellAssistant: jest.fn(async () => undefined),
    presentRequests: jest.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, status: r.status })),
    ),
  });
  return { svc, prisma, posts, profiles, r };
}

const attorney = { sub: 'att', role: 'attorney' } as never;
const assistant = {
  sub: 'att',
  role: 'attorney',
  assistant: { membershipId: 'm1', duties: ['posts', 'profile', 'cases'] },
} as never;

describe('assistant requests (R2B-2, R2B-11)', () => {
  it('a profile_edit that the profile DTO forbids is refused at filing', async () => {
    const w = world();
    await expect(
      w.svc.createRequest(assistant, {
        kind: 'profile_edit',
        payload: { username: 'x'.repeat(2000) },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(w.prisma.assistantRequest.create).not.toHaveBeenCalled();
  });

  it('a post with a malformed attachment list is refused at filing', async () => {
    const w = world();
    await expect(
      w.svc.createRequest(assistant, {
        kind: 'post',
        payload: { title: 'Hi', mediaFileIds: ['not-a-uuid'] },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('a stored bad payload is never applied on approval', async () => {
    const w = world({
      kind: 'profile_edit',
      payload: { username: 'x'.repeat(2000), bio: 'ok' },
    });
    await expect(w.svc.approve(attorney, 'r1')).rejects.toMatchObject({
      status: 400,
    });
    expect(w.profiles.updateOwn).not.toHaveBeenCalled();
    expect(w.r.status).toBe('pending');
  });

  it('a valid profile_edit (what the app sends) is applied', async () => {
    const w = world({
      kind: 'profile_edit',
      payload: { firstName: 'Ann', bio: 'New bio', languages: ['en'] },
    });
    await w.svc.approve(attorney, 'r1');
    expect(w.profiles.updateOwn).toHaveBeenCalledTimes(1);
    expect(w.r.status).toBe('approved');
  });

  it('approving twice at once publishes the post once', async () => {
    const w = world();
    const results = await Promise.allSettled([
      w.svc.approve(attorney, 'r1'),
      w.svc.approve(attorney, 'r1'),
    ]);
    expect(w.posts.create).toHaveBeenCalledTimes(1);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(w.r).toMatchObject({ status: 'approved', result_id: 'p1' });
  });

  it('a failed publish puts the request back to pending', async () => {
    const w = world();
    w.posts.create.mockRejectedValueOnce(new Error('boom'));
    await expect(w.svc.approve(attorney, 'r1')).rejects.toThrow('boom');
    expect(w.r.status).toBe('pending');
  });
});
