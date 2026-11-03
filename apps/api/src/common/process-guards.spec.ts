import { runEntrypoint } from './process-guards';

describe('runEntrypoint', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errSpy.mockRestore());

  it('does not exit when start-up succeeds', async () => {
    const exit = jest.fn();
    await runEntrypoint('api', () => Promise.resolve(), exit);
    expect(exit).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('logs one readable line and exits 1 when start-up rejects', async () => {
    const exit = jest.fn();
    await runEntrypoint(
      'api',
      () => Promise.reject(new Error('DATABASE_URL missing')),
      exit,
    );
    expect(exit).toHaveBeenCalledWith(1);
    const line = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(line.alert).toBe('startup_failed');
    expect(line.msg).toBe('api failed to start');
    expect(line.err.message).toBe('DATABASE_URL missing');
  });

  it('handles a non-Error rejection', async () => {
    const exit = jest.fn();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point: a non-Error reason
    await runEntrypoint('worker', () => Promise.reject('boom'), exit);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('keeps AggregateError details and hides URL credentials', async () => {
    const exit = jest.fn();
    const inner = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    const agg = new AggregateError([inner], '');
    const leaky = new Error('bad url postgres://app:s3cret@db:5432/x', {
      cause: agg,
    });
    await runEntrypoint('api', () => Promise.reject(leaky), exit);
    const raw = errSpy.mock.calls[0][0] as string;
    expect(raw).not.toContain('s3cret');
    const line = JSON.parse(raw);
    expect(line.err.cause.errors[0].code).toBe('ECONNREFUSED');
  });

  it('catches a synchronous throw from main', async () => {
    const exit = jest.fn();
    await runEntrypoint(
      'api',
      () => {
        throw new Error('sync');
      },
      exit,
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
