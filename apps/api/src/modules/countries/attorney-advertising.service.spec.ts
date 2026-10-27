import { attorneyPublicUrl } from '../../common/utils/public-urls';
import { AttorneyAdvertisingService } from './attorney-advertising.service';

function make(
  labelled: string[],
  placement = { sponsored: false, paid: false },
) {
  const prisma = {
    $queryRaw: jest.fn(() => Promise.resolve([placement])),
    appConfig: { findUnique: jest.fn(() => Promise.resolve(null)) },
    state: {
      findMany: jest.fn(() =>
        Promise.resolve(labelled.map((code) => ({ code }))),
      ),
    },
    attorneyLicense: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: {
            attorney_id: { in: string[] };
            state_code: { in: string[] };
          };
        }) =>
          Promise.resolve(
            [
              { attorney_id: 'ny-lawyer', state_code: 'NY' },
              { attorney_id: 'nj-lawyer', state_code: 'NJ' },
            ].filter(
              (l) =>
                where.attorney_id.in.includes(l.attorney_id) &&
                where.state_code.in.includes(l.state_code),
            ),
          ),
      ),
    },
  };
  return {
    prisma,
    svc: new AttorneyAdvertisingService(prisma as never),
  };
}

describe('AttorneyAdvertisingService (owner 2026-10-22, audit #4 §5)', () => {
  it('a licence in a labelled state turns the label on', async () => {
    const { svc } = make(['NY']);
    expect(await svc.requiresLabel(['NJ', 'NY'])).toBe(true);
    expect(await svc.requiresLabel(['NJ'])).toBe(false);
    expect(await svc.requiresLabel([])).toBe(false);
  });

  it('one query labels a whole feed page', async () => {
    const { svc, prisma } = make(['NY']);
    const out = await svc.labelledAttorneys(['ny-lawyer', 'nj-lawyer']);
    expect([...out]).toEqual(['ny-lawyer']);
    expect(prisma.attorneyLicense.findMany).toHaveBeenCalledTimes(1);
    expect(await svc.labelledAttorneys([])).toEqual(new Set());
  });

  it('states are cached until an admin toggles one', async () => {
    const { svc, prisma } = make(['NY']);
    await svc.labelStates();
    await svc.labelStates();
    expect(prisma.state.findMany).toHaveBeenCalledTimes(1);
    svc.invalidate();
    await svc.labelStates();
    expect(prisma.state.findMany).toHaveBeenCalledTimes(2);
  });

  it('no labelled state: no licence query at all', async () => {
    const { svc, prisma } = make([]);
    expect(await svc.labelledAttorneys(['ny-lawyer'])).toEqual(new Set());
    expect(prisma.attorneyLicense.findMany).not.toHaveBeenCalled();
  });
});

describe('attorneyPublicUrl (audit #4 §9)', () => {
  it('profileFlags: one query gives both flags, then the cache answers (review R-72)', async () => {
    const { svc, prisma } = make([], { sponsored: true, paid: true });
    const first = await svc.profileFlags('a1', ['NJ']);
    const second = await svc.profileFlags('a1', ['NJ']);
    expect(first).toEqual(second);
    expect(first.sponsored).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('profileFlags: the label comes from a labelled state without any paid flag', async () => {
    const { svc } = make(['NY'], { sponsored: false, paid: false });
    expect(await svc.profileFlags('a1', ['NY'])).toEqual({
      advertisingLabel: true,
      sponsored: false,
    });
    expect(await svc.profileFlags('a1', ['NJ'])).toEqual({
      advertisingLabel: false,
      sponsored: false,
    });
  });

  it('profileFlags: an admin change (invalidate) drops the cached flags', async () => {
    const { svc, prisma } = make([], { sponsored: true, paid: true });
    await svc.profileFlags('a1', []);
    svc.invalidate();
    await svc.profileFlags('a1', []);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('profileFlags: the cache is bounded (oldest entry leaves)', async () => {
    const { svc, prisma } = make([], { sponsored: false, paid: false });
    for (let i = 0; i < 2001; i += 1) await svc.profileFlags(`a${i}`, []);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2001);
    await svc.profileFlags('a0', []); // evicted: queried again
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2002);
    await svc.profileFlags('a2000', []); // still cached
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2002);
  });

  it('is the SEO page /attorneys/<username>/ on the public origin', () => {
    expect(attorneyPublicUrl('Saul_G', 'https://lawbid.app')).toBe(
      'https://lawbid.app/attorneys/saul_g/',
    );
    expect(attorneyPublicUrl('a', 'https://x.test/')).toBe(
      'https://x.test/attorneys/a/',
    );
    expect(attorneyPublicUrl('a', undefined)).toBe(
      'https://lawbid.app/attorneys/a/',
    );
  });
});
