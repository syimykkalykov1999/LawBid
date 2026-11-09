import {
  classifySesError,
  recordSesOk,
  recordSesProblem,
  sesDeliveryStatus,
  setSesDeliverySink,
} from './ses-delivery';

/** 08.11.2026: the «Здоровье» card names the SES sandbox. */
describe('SES delivery reading', () => {
  const sandboxError = Object.assign(
    new Error(
      'Email address is not verified. The following identities failed the check in region US-EAST-1: someone@example.test',
    ),
    { name: 'MessageRejected', $metadata: { httpStatusCode: 400 } },
  );

  afterEach(() => setSesDeliverySink(null));

  it('classifies the sandbox refusal, a missing IAM right and anything else', () => {
    expect(classifySesError(sandboxError)).toBe('sandbox');
    expect(
      classifySesError(
        Object.assign(new Error('not authorized'), { name: 'AccessDenied' }),
      ),
    ).toBe('no_permission');
    expect(classifySesError(new Error('socket hang up'))).toBe('error');
    // MessageRejected for another reason is not the sandbox
    expect(
      classifySesError(
        Object.assign(new Error('Message too large'), {
          name: 'MessageRejected',
        }),
      ),
    ).toBe('error');
  });

  it('the card: sandbox newer than the last ok = red with the plain words', () => {
    const r = sesDeliveryStatus(1000, { kind: 'sandbox', atMs: 2000 });
    expect(r.status).toBe('red');
    expect(r.detail.text).toBe('SES: песочница — письма не уходят');
    expect(
      sesDeliveryStatus(3000, { kind: 'sandbox', atMs: 2000 }).status,
    ).toBe('green');
    expect(sesDeliveryStatus(null, null).status).toBe('grey');
    expect(
      sesDeliveryStatus(null, { kind: 'no_permission', atMs: 1 }).detail.text,
    ).toContain('нет права');
    expect(sesDeliveryStatus(null, { kind: 'error', atMs: 1 }).status).toBe(
      'yellow',
    );
  });

  it('the provider hooks feed the sink; ok at most once a minute', () => {
    const sink = { ok: jest.fn(), problem: jest.fn() };
    setSesDeliverySink(sink);
    recordSesOk(100_000);
    recordSesOk(110_000);
    recordSesOk(170_000);
    expect(sink.ok).toHaveBeenCalledTimes(2);
    recordSesProblem(sandboxError, 200_000);
    expect(sink.problem).toHaveBeenCalledWith(
      'sandbox',
      200_000,
      expect.stringContaining('not verified'),
    );
  });

  it('a throwing sink never breaks a send', () => {
    setSesDeliverySink({
      ok: () => {
        throw new Error('redis down');
      },
      problem: () => {
        throw new Error('redis down');
      },
    });
    expect(() => recordSesOk(1e9)).not.toThrow();
    expect(() => recordSesProblem(sandboxError)).not.toThrow();
  });
});
