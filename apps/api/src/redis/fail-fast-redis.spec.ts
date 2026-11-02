import {
  RedisUnavailableError,
  attachFailFast,
  isRedisInfraError,
  throttledWarn,
} from './fail-fast-redis';

/** A stand-in for ioredis: `status` + `sendCommand` that answers as told. */
function fakeClient(answer: (cmd: FakeCommand) => void, status = 'ready') {
  const handlers: Record<string, () => void> = {};
  const client = {
    status,
    sendCommand: jest.fn((cmd: FakeCommand, stream?: unknown) => {
      void stream;
      answer(cmd);
      return cmd.promise;
    }),
    on: jest.fn((event: string, fn: () => void) => {
      handlers[event] = fn;
    }),
  };
  return { client, handlers, original: client.sendCommand };
}

class FakeCommand {
  name = 'get';
  promise: Promise<unknown>;
  private rejectFn!: (e: Error) => void;
  private resolveFn!: (v: unknown) => void;
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
    this.promise.catch(() => undefined);
  }
  reject(e: Error) {
    this.rejectFn(e);
  }
  resolve(v: unknown) {
    this.resolveFn(v);
  }
}

const timeout = () => new Error('Command timed out');
const settle = () => new Promise((r) => setImmediate(r));

describe('attachFailFast', () => {
  it('after the client has been ready, a lost connection refuses at once; the handshake and the first boot still queue', async () => {
    const { client, original } = fakeClient((c) => c.resolve('ok'));
    const gate = attachFailFast(client as never);
    for (const status of ['reconnecting', 'connecting', 'close', 'end']) {
      client.status = status;
      await expect(
        client.sendCommand(new FakeCommand()),
      ).rejects.toBeInstanceOf(RedisUnavailableError);
      expect(gate.refusing).toBe(true);
    }
    expect(original).not.toHaveBeenCalled();
    for (const status of ['connect', 'ready']) {
      client.status = status;
      await expect(client.sendCommand(new FakeCommand())).resolves.toBe('ok');
    }
    expect(original).toHaveBeenCalledTimes(2);
    expect(gate.refusing).toBe(false);

    // A client that was never ready (first boot) queues as before.
    const boot = fakeClient((c) => c.resolve('ok'), 'connecting');
    attachFailFast(boot.client as never);
    await expect(boot.client.sendCommand(new FakeCommand())).resolves.toBe(
      'ok',
    );
    boot.client.status = 'reconnecting';
    await expect(boot.client.sendCommand(new FakeCommand())).resolves.toBe(
      'ok',
    );
    expect(boot.original).toHaveBeenCalledTimes(2);
  });

  it('N command timeouts in a row open the breaker; after the pause exactly one trial passes; ready resets', async () => {
    let t = 1_000_000;
    const { client, handlers, original } = fakeClient((c) =>
      c.reject(timeout()),
    );
    const gate = attachFailFast(client as never, {
      timeoutThreshold: 3,
      pauseMs: 5000,
      now: () => t,
    });
    for (let i = 0; i < 3; i += 1) {
      await expect(client.sendCommand(new FakeCommand())).rejects.toThrow(
        'Command timed out',
      );
    }
    expect(gate.refusing).toBe(true);
    await expect(client.sendCommand(new FakeCommand())).rejects.toMatchObject({
      name: 'RedisUnavailableError',
      reason: 'timeouts',
    });
    expect(original).toHaveBeenCalledTimes(3);
    t += 5001; // pause over: ONE trial reaches Redis, a second concurrent command is refused
    const trial = client.sendCommand(new FakeCommand());
    const second = client.sendCommand(new FakeCommand());
    await expect(second).rejects.toMatchObject({ reason: 'timeouts' });
    await expect(trial).rejects.toThrow('Command timed out');
    expect(original).toHaveBeenCalledTimes(4);
    await settle();
    expect(gate.refusing).toBe(true); // the trial failed: paused again
    handlers.ready();
    expect(gate.refusing).toBe(false);
  });

  it('successes close the count; errors that are not timeouts are not failures', async () => {
    let n = 0;
    const { client } = fakeClient((c) => {
      n += 1;
      if (n % 2) c.reject(timeout());
      else c.resolve('ok');
    });
    const gate = attachFailFast(client as never, { timeoutThreshold: 2 });
    for (let i = 0; i < 6; i += 1) {
      await client.sendCommand(new FakeCommand()).catch(() => undefined);
    }
    await settle();
    expect(gate.refusing).toBe(false);
    const wrong = fakeClient((c) =>
      c.reject(new Error('ERR wrong number of arguments')),
    );
    const gate2 = attachFailFast(wrong.client as never, {
      timeoutThreshold: 2,
    });
    for (let i = 0; i < 6; i += 1) {
      await wrong.client.sendCommand(new FakeCommand()).catch(() => undefined);
    }
    await settle();
    expect(gate2.refusing).toBe(false);
  });

  it('a pipeline gets one verdict for all its commands', async () => {
    const { client, original } = fakeClient((c) => c.resolve('ok'));
    attachFailFast(client as never);
    const stream = { isPipeline: true };
    client.status = 'reconnecting';
    const a = client.sendCommand(new FakeCommand(), stream);
    client.status = 'ready'; // flips while the pipeline is still being handed over
    const b = client.sendCommand(new FakeCommand(), stream);
    await expect(a).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(b).rejects.toBeInstanceOf(RedisUnavailableError);
    expect(original).not.toHaveBeenCalled();
    const next = { isPipeline: true };
    await expect(
      client.sendCommand(new FakeCommand(), next as never),
    ).resolves.toBe('ok');
  });
});

describe('isRedisInfraError', () => {
  it('recognises the gate error and ioredis connection errors, not command errors', () => {
    const retries = new Error('Reached the max retries per request limit');
    retries.name = 'MaxRetriesPerRequestError';
    for (const e of [
      new RedisUnavailableError('disconnected'),
      timeout(),
      retries,
      new Error(
        "Stream isn't writeable and enableOfflineQueue options is false",
      ),
      new Error('Connection is closed.'),
    ]) {
      expect(isRedisInfraError(e)).toBe(true);
    }
    expect(isRedisInfraError(new Error('ERR unknown command'))).toBe(false);
    expect(isRedisInfraError('Command timed out')).toBe(false);
  });
});

describe('throttledWarn', () => {
  it('logs at most once per window', () => {
    let t = 0;
    const logger = {
      warn: jest.fn<void, [Record<string, unknown>, string]>(),
    };
    const warn = throttledWarn(logger, 1000, () => t);
    warn({ a: 1 }, 'm');
    warn({ a: 2 }, 'm');
    t = 999;
    warn({ a: 3 }, 'm');
    t = 1000;
    warn({ a: 4 }, 'm');
    expect(logger.warn.mock.calls.map((c) => c[0])).toEqual([
      { a: 1 },
      { a: 4 },
    ]);
  });
});
