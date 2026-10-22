import { createHash, createHmac } from 'node:crypto';
import { ContactsPepper } from './contacts-pepper';

const PEPPER = 'unit_test_contacts_pepper_at_least_32_chars';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (h: string) =>
  createHmac('sha256', PEPPER).update(h).digest('hex');

function pepper(value: string | undefined, env = 'test'): ContactsPepper {
  const config = {
    get: (k: string) => (k === 'CONTACTS_PEPPER' ? value : env),
  };
  return new ContactsPepper(config as never);
}

/** Security research #5 (2026-10-22), A7. */
describe('ContactsPepper', () => {
  it('without a pepper stores the client hash as it is', () => {
    const p = pepper(undefined);
    expect(p.enabled).toBe(false);
    expect(p.seal(sha('+1'))).toBe(sha('+1'));
    expect(p.row(sha('+1'))).toEqual({
      phone_hash: sha('+1'),
      peppered: false,
    });
    expect(p.forms(sha('+1'))).toEqual([sha('+1')]);
    expect(p.where([sha('+1')])).toEqual({
      OR: [{ phone_hash: { in: [sha('+1')] } }],
    });
  });

  it('a short pepper is ignored (never a weak key by accident)', () => {
    expect(pepper('short').enabled).toBe(false);
  });

  it('with a pepper stores the HMAC and marks the row peppered', () => {
    const p = pepper(PEPPER);
    expect(p.enabled).toBe(true);
    expect(p.seal(sha('+1'))).toBe(hmac(sha('+1')));
    expect(p.seal(sha('+1'))).not.toBe(sha('+1'));
    expect(p.row(sha('+1'))).toEqual({
      phone_hash: hmac(sha('+1')),
      peppered: true,
    });
  });

  it('reads both forms while the backfill runs, and maps them back', () => {
    const p = pepper(PEPPER);
    expect(p.forms(sha('+1'))).toEqual([hmac(sha('+1')), sha('+1')]);
    expect(p.where([sha('+1'), sha('+2')])).toEqual({
      OR: [
        {
          phone_hash: { in: [hmac(sha('+1')), hmac(sha('+2'))] },
          peppered: true,
        },
        { phone_hash: { in: [sha('+1'), sha('+2')] }, peppered: false },
      ],
    });
    const back = p.unsealMap([sha('+1')]);
    expect(back.get(hmac(sha('+1')))).toBe(sha('+1'));
    expect(back.get(sha('+1'))).toBe(sha('+1'));
    expect(back.get(sha('+2'))).toBeUndefined();
  });

  it('a different pepper gives a different stored value', () => {
    const a = pepper(PEPPER).seal(sha('+1'));
    const b = pepper(PEPPER + '_other').seal(sha('+1'));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('warns on production without a pepper, not elsewhere', () => {
    const logger = { setContext: jest.fn(), warn: jest.fn() };
    new ContactsPepper(
      {
        get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined),
      } as never,
      logger as never,
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
    logger.warn.mockClear();
    new ContactsPepper(
      {
        get: (k: string) => (k === 'NODE_ENV' ? 'development' : undefined),
      } as never,
      logger as never,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
