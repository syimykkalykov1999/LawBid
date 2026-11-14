import { createHash } from 'node:crypto';
import { OutreachService } from './outreach.service';
import { UnsubscribeTokenCodec } from './unsubscribe-token';

/**
 * Detective R2B-14 (14.11): the unsubscribe secret is no longer kept in
 * the database. New links are signed (HMAC, key ring with a key id);
 * links already sent keep working through the sha256 the row keeps; a
 * row not migrated yet is found by its raw token once and migrated then;
 * anything forged is refused.
 */
const KEYS = `k1:${'a'.repeat(40)},k0:${'b'.repeat(40)}`;
const LEAD = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OLD_RAW = 'OldRawToken_0123456789abcdef';

type Row = Record<string, unknown>;

function setup(lead: Row, keys = KEYS, kid = 'k1') {
  const rows = [lead];
  const find = (where: Row) =>
    rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ??
    null;
  const prisma = {
    outreachLead: {
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(find(where)),
      ),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(find(where)),
      ),
      update: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const r = find(where)!;
        Object.assign(r, data);
        return Promise.resolve(r);
      }),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const r = find(where);
        if (r) Object.assign(r, data);
        return Promise.resolve({ count: r ? 1 : 0 });
      }),
    },
    outreachActivity: { create: jest.fn(() => Promise.resolve({})) },
    outreachSuppression: { upsert: jest.fn(() => Promise.resolve({})) },
  };
  const config = {
    get: (k: string) =>
      k === 'SECRETS_MASTER_KEYS'
        ? keys
        : k === 'SECRETS_ACTIVE_KID'
          ? kid
          : undefined,
  };
  const svc = new OutreachService(
    prisma as never,
    {} as never,
    {} as never,
    undefined,
    config as never,
  );
  jest
    .spyOn(svc as unknown as { log(): Promise<void> }, 'log')
    .mockResolvedValue();
  jest
    .spyOn(
      svc as unknown as { markDoNotContact(): Promise<void> },
      'markDoNotContact',
    )
    .mockResolvedValue();
  return { svc, lead };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('outreach unsubscribe tokens (R2B-14)', () => {
  it('new link: a signed token unsubscribes its lead; the DB holds no secret', async () => {
    const { svc, lead } = setup({
      id: LEAD,
      unsubscribe_token: null,
      unsubscribe_token_hash: null,
      unsubscribed_at: null,
    });
    const token = svc.unsubscribeLinkToken(lead as never);
    expect(token).toMatch(/^u1\.k1\./);
    expect(await svc.unsubscribe(token)).toBe(true);
    expect(lead.unsubscribed_at).toBeInstanceOf(Date);
  });

  it('old link: a raw token already sent works through the stored hash', async () => {
    const { svc, lead } = setup({
      id: LEAD,
      unsubscribe_token: null,
      unsubscribe_token_hash: sha(OLD_RAW),
      unsubscribed_at: null,
    });
    expect(await svc.unsubscribe(OLD_RAW)).toBe(true);
    expect(lead.unsubscribed_at).toBeInstanceOf(Date);
  });

  it('a row not migrated yet: found once by its raw token, then only the hash stays', async () => {
    const { svc, lead } = setup({
      id: LEAD,
      unsubscribe_token: OLD_RAW,
      unsubscribe_token_hash: null,
      unsubscribed_at: null,
    });
    expect(await svc.unsubscribe(OLD_RAW)).toBe(true);
    expect(lead.unsubscribe_token_hash).toBe(sha(OLD_RAW));
  });

  it('a link signed with the previous key (rotation) still works', async () => {
    const old = new UnsubscribeTokenCodec(KEYS, 'k0').sign(LEAD);
    const { svc, lead } = setup({
      id: LEAD,
      unsubscribe_token: null,
      unsubscribe_token_hash: null,
      unsubscribed_at: null,
    });
    expect(await svc.unsubscribe(old)).toBe(true);
    expect(lead.unsubscribed_at).toBeInstanceOf(Date);
  });

  it.each([
    ['a changed MAC', (t: string) => `${t.slice(0, -2)}AA`],
    [
      'another lead id under the same MAC',
      (t: string) => {
        const p = t.split('.');
        p[2] = Buffer.from('1'.repeat(32), 'hex').toString('base64url');
        return p.join('.');
      },
    ],
    ['an unknown key id', (t: string) => t.replace('u1.k1.', 'u1.kx.')],
    [
      'a key outside the ring',
      () => new UnsubscribeTokenCodec(`k1:${'z'.repeat(40)}`, 'k1').sign(LEAD),
    ],
  ])('forged: %s is refused', async (_n, forge) => {
    const { svc, lead } = setup({
      id: LEAD,
      unsubscribe_token: null,
      unsubscribe_token_hash: null,
      unsubscribed_at: null,
    });
    const good = svc.unsubscribeLinkToken(lead as never);
    expect(await svc.unsubscribe(forge(good))).toBe(false);
    expect(lead.unsubscribed_at).toBeNull();
  });
});
