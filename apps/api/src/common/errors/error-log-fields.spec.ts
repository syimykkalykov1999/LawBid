import { errorLogFields, settleWithin } from './error-log-fields';

describe('errorLogFields', () => {
  it('names an Error with an empty message by its code or name and keeps the stack', () => {
    const e = Object.assign(new Error(''), { code: 'ECONNRESET' });
    expect(errorLogFields(e)).toMatchObject({
      err: 'ECONNRESET',
      errName: 'Error',
      errCode: 'ECONNRESET',
      errStack: expect.stringContaining('Error'),
    });
    expect(errorLogFields(new TypeError('')).err).toBe('TypeError');
  });

  it('uses the inner messages of an AggregateError and the message when present', () => {
    expect(
      errorLogFields(new AggregateError([new Error('a'), 'b'], '')).err,
    ).toBe('a; b');
    expect(errorLogFields(new Error('boom')).err).toBe('boom');
    expect(errorLogFields('plain')).toEqual({ err: 'plain' });
  });
});

describe('settleWithin', () => {
  it('reports the error and returns true when work rejects', async () => {
    const onError = jest.fn();
    expect(
      await settleWithin(Promise.reject(new Error('x')), 50, onError),
    ).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout when work hangs', async () => {
    expect(
      await settleWithin(new Promise(() => undefined), 20, jest.fn()),
    ).toBe(false);
  });
});
