import { attorneyPublicUrl } from '../../common/utils/public-urls';
import { AttorneyAdvertisingService } from './attorney-advertising.service';

function make(labelled: string[]) {
  const prisma = {
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
