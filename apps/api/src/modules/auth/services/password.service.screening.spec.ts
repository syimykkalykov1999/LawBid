import { createHash } from 'node:crypto';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { PasswordService } from './password.service';

function settings(over: Record<string, number | boolean> = {}) {
  const v: Record<string, number | boolean> = {
    'security.password_breach_check_enabled': true,
    'security.password_breach_timeout_ms': 1500,
    'security.password_common_list_enabled': true,
    'security.password_hash_concurrency': 2,
    'security.password_hash_max_queue': 3,
    ...over,
  };
  return {
    number: jest.fn((k: string) => Promise.resolve(v[k] as number)),
    boolean: jest.fn((k: string) => Promise.resolve(v[k] as boolean)),
  } as unknown as AppSettingsService;
}

const logger = () => ({ info: jest.fn(), warn: jest.fn() }) as never;

function sha1(p: string) {
  return createHash('sha1').update(p).digest('hex').toUpperCase();
}

describe('PasswordService screening (NIST SP 800-63B-4 3.1.1.2)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { getResponse: () => { code: string } }) => e.getResponse().code,
    );

  it('refuses a password from the common list, with the app error code', async () => {
    const svc = new PasswordService(
      settings({ 'security.password_breach_check_enabled': false }),
      logger(),
    );
    expect(
      await codeOf(svc.assertNotCompromised('Zx9-unusual-phrase-77')),
    ).toBeNull();
    expect(await codeOf(svc.assertNotCompromised('PASSWORD'))).toBe(
      ErrorCode.AUTH_PASSWORD_COMPROMISED,
    );
  });

  it('the common list can be switched off', async () => {
    const svc = new PasswordService(
      settings({
        'security.password_common_list_enabled': false,
        'security.password_breach_check_enabled': false,
      }),
      logger(),
    );
    expect(await codeOf(svc.assertNotCompromised('password'))).toBeNull();
  });

  it('sends only the 5-char prefix with Add-Padding and refuses a breached password', async () => {
    const pw = 'Zx9-unusual-passphrase-77';
    const h = sha1(pw);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          `0000000000000000000000000000000000A:0\r\n${h.slice(5)}:42\r\n`,
        ),
    });
    global.fetch = fetchMock as never;
    const svc = new PasswordService(settings(), logger());
    expect(await codeOf(svc.assertNotCompromised(pw))).toBe(
      ErrorCode.AUTH_PASSWORD_COMPROMISED,
    );
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`);
    expect(url).not.toContain(h.slice(5));
    expect(init.headers['Add-Padding']).toBe('true');
  });

  it('a padding row (count 0) is not a hit', async () => {
    const pw = 'Another-long-unique-phrase-9';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`${sha1(pw).slice(5)}:0\r\n`),
    }) as never;
    const svc = new PasswordService(settings(), logger());
    expect(await codeOf(svc.assertNotCompromised(pw))).toBeNull();
  });

  it('fails open and logs when the service is down or slow', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as never;
    const log = logger();
    const svc = new PasswordService(settings(), log);
    expect(
      await codeOf(svc.assertNotCompromised('Some-long-unique-phrase-1')),
    ).toBeNull();
    expect((log as unknown as { warn: jest.Mock }).warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'password_breach_check_skipped' }),
      expect.any(String),
    );
  });

  it('does not call the network when the check is off', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const svc = new PasswordService(
      settings({ 'security.password_breach_check_enabled': false }),
      logger(),
    );
    await svc.assertNotCompromised('Some-long-unique-phrase-2');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PasswordService hash concurrency cap', () => {
  it('queues hashes beyond the cap, and refuses beyond the queue', async () => {
    const log = logger();
    // cap 2 running + queue of 3
    const svc = new PasswordService(settings(), log);
    const runs = Array.from({ length: 5 }, () => svc.hash('Correct horse 1'));
    const extra = svc.hash('Correct horse 1');
    expect(
      await extra.then(
        () => 'ok',
        (e: { getResponse: () => { code: string } }) => e.getResponse().code,
      ),
    ).toBe(ErrorCode.RATE_LIMITED);
    const hashes = await Promise.all(runs);
    expect(hashes).toHaveLength(5);
    const queued = (log as unknown as { info: jest.Mock }).info.mock.calls.map(
      (c) => (c[0] as { queued: number }).queued,
    );
    expect(Math.max(...queued)).toBeGreaterThan(0);
    // all slots released
    expect(await svc.verify('Correct horse 1', hashes[0])).toBe(true);
  });
});
