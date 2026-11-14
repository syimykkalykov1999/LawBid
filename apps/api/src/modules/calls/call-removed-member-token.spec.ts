/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call } from '../../generated/prisma/client';
import { CallsService } from './calls.service';

/**
 * R2B-3 (detective R2, 14.11): A calls B, adds C (now a group call), then
 * removes B. B was the callee, so the old check (`caller || callee ||
 * joined`) still gave B a fresh LiveKit token and B rejoined as a speaker.
 * In a group call only a `joined` row counts — for everyone.
 */
function world(opts: { isGroup: boolean; rows: Record<string, string> }) {
  const call = {
    id: 'c1',
    status: 'active',
    is_group: opts.isGroup,
    channel_id: null,
    caller_id: 'a',
    callee_id: 'b',
  } as unknown as Call;
  const livekit = {
    keys: jest.fn(async () => ({ url: 'wss://lk', key: 'k', secret: 's' })),
    ensureRoom: jest.fn(async () => undefined),
    issueToken: jest.fn(async () => ({
      url: 'wss://lk',
      token: 't',
      expiresAt: new Date(),
    })),
  };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma: { call: { findUnique: jest.fn(async () => ({ ...call })) } },
    livekit,
    rowOf: jest.fn(async (_c: string, uid: string) =>
      opts.rows[uid] ? { user_id: uid, status: opts.rows[uid] } : null,
    ),
    activeVideoProvider: jest.fn(async () => ({ name: 'livekit' })),
    capacityOf: jest.fn(async () => 8),
  });
  return { svc, livekit };
}
const as = (sub: string) => ({ sub }) as never;

describe('removed group-call member gets no LiveKit token (R2B-3)', () => {
  const rows = { a: 'joined', b: 'removed', c: 'joined' };

  it('the removed callee is refused', async () => {
    const w = world({ isGroup: true, rows });
    await expect(w.svc.livekitToken(as('b'), 'c1')).rejects.toMatchObject({
      status: 404,
    });
    expect(w.livekit.issueToken).not.toHaveBeenCalled();
  });

  it('a removed caller is refused too', async () => {
    const w = world({ isGroup: true, rows: { ...rows, a: 'removed' } });
    await expect(w.svc.livekitToken(as('a'), 'c1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('joined members still get their token', async () => {
    const w = world({ isGroup: true, rows });
    await expect(w.svc.livekitToken(as('c'), 'c1')).resolves.toMatchObject({
      token: 't',
    });
    await expect(w.svc.livekitToken(as('a'), 'c1')).resolves.toMatchObject({
      token: 't',
    });
  });

  it('a two-person call is unchanged: caller and callee, no rows', async () => {
    const w = world({ isGroup: false, rows: {} });
    await expect(w.svc.livekitToken(as('b'), 'c1')).resolves.toMatchObject({
      token: 't',
    });
    await expect(w.svc.livekitToken(as('x'), 'c1')).rejects.toMatchObject({
      status: 404,
    });
  });
});
