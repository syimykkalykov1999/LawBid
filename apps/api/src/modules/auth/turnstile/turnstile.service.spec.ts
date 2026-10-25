import {
  TURNSTILE_SITEVERIFY_URL,
  TURNSTILE_TOKEN_MAX,
  TurnstileService,
} from './turnstile.service';

describe('TurnstileService', () => {
  let fields: Record<string, string | undefined>;
  const fetchMock = jest.fn();
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const realFetch = global.fetch;

  const service = () =>
    new TurnstileService(
      { field: (_p: string, n: string) => Promise.resolve(fields[n]) } as never,
      logger as never,
    );
  const answer = (body: unknown, ok = true, status = 200) =>
    fetchMock.mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    });

  beforeEach(() => {
    fields = { secretKey: '1x0000000000000000000000000000000AA' };
    fetchMock.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('no secret key saved: unconfigured, Cloudflare is not called', async () => {
    fields = {};
    expect((await service().verify('t')).verdict).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing or oversized token is invalid without a network call', async () => {
    expect((await service().verify(undefined)).verdict).toBe('invalid');
    expect(
      (await service().verify('x'.repeat(TURNSTILE_TOKEN_MAX + 1))).reason,
    ).toBe('token-too-long');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts secret, response and remoteip as a form to siteverify', async () => {
    answer({ success: true, hostname: 'lawbid.dev', action: 'otp' });
    const res = await service().verify('tok', { ip: '1.2.3.4' });
    expect(res).toMatchObject({ verdict: 'valid', hostname: 'lawbid.dev' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init.method).toBe('POST');
    const form = init.body as URLSearchParams;
    expect(form.get('secret')).toBe(fields.secretKey);
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe('1.2.3.4');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('success:false is invalid with the error codes', async () => {
    answer({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    expect(await service().verify('tok')).toMatchObject({
      verdict: 'invalid',
      reason: 'timeout-or-duplicate',
    });
  });

  it('our bad secret is unavailable (not the visitor fault) and logged', async () => {
    answer({ success: false, 'error-codes': ['invalid-input-secret'] });
    expect((await service().verify('tok')).verdict).toBe('unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('checks the hostname against the allowed list', async () => {
    fields.hostnames = 'lawbid.dev,www.lawbid.dev';
    answer({ success: true, hostname: 'evil.example' });
    expect(await service().verify('tok')).toMatchObject({
      verdict: 'invalid',
      reason: 'hostname-mismatch',
    });
    answer({ success: true, hostname: 'WWW.lawbid.dev' });
    expect((await service().verify('tok')).verdict).toBe('valid');
  });

  it('checks the action when one is expected', async () => {
    answer({ success: true, hostname: 'lawbid.dev', action: 'login' });
    expect(
      (await service().verify('tok', { expectedAction: 'otp' })).reason,
    ).toBe('action-mismatch');
    expect(
      (await service().verify('tok', { expectedAction: 'login' })).verdict,
    ).toBe('valid');
  });

  it('HTTP error, network error and timeout are unavailable', async () => {
    answer({}, false, 500);
    expect(await service().verify('t')).toMatchObject({
      verdict: 'unavailable',
      reason: 'http-500',
    });
    fetchMock.mockRejectedValue(new Error('boom'));
    expect((await service().verify('t')).reason).toBe('network');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValue(abort);
    expect((await service().verify('t')).reason).toBe('timeout');
  });
});
