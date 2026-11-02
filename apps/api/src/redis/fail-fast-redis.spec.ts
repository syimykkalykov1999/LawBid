import {
  RedisUnavailableError,
  attachFailFast,
  isRedisInfraError,
} from './fail-fast-redis';

/** A stand-in for ioredis: `status` + `sendCommand` that answers as told. */
function fakeClient(answer: (cmd: FakeCommand) => void) {
  const handlers: Record<string, () => void> = {};
  const client = {
    status: 'ready',
    sendCommand: jest.fn((cmd: FakeCommand) => {
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

describe('attachFailFast', () => {
  it('refuses at once while the connection is lost, queues while booting', async () => {
    const { client, original } = fakeClient((c) => c.resolve('ok'));
    const gate = attachFailFast(client as never);
    for (const status of ['reconnecting', 'close', 'end']) {
      client.status = status;
      const cmd = new FakeCommand();
      await expect(client.sendCommand(cmd)).rejects.toBeInstanceOf(
        RedisUnavailableError,
      );
      expect(gate.refusing).toBe(true);
    }
    expect(original).not.toHaveBeenCalled();
    for (const status of ['wait', 'connecting', 'connect', 'ready']) {
      client.status = status;
      const cmd = new FakeCommand();
      await expect(client.sendCommand(cmd)).resolves.toBe('ok');
    }
    expect(original).toHaveBeenCalledTimes(4);
    expect(gate.refusing).toBe(false);
  });

  it('pauses after N command timeouts in a row, lets one through after the pause, resets on ready', async () => {
    let t = 1_000_000;
    const { client, handlers, original } = fakeClient((c) =>
      c.reject(new Error('Command timed out')),
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
    const refused = new FakeCommand();
    await expect(client.sendCommand(refused)).rejects.toMatchObject({
      name: 'RedisUnavailableError',
      reason: 'timeouts',
    });
    expect(original).toHaveBeenCalledTimes(3);
    t += 5001; // pause over: the next command reaches Redis again
    await expect(client.sendCommand(new FakeCommand())).rejects.toThrow(
      'Command timed out',
    );
    expect(original).toHaveBeenCalledTimes(4);
    // two more timeouts pause again; `ready` clears everything
    await client.sendCommand(new FakeCommand()).catch(() => undefined);
    await client.sendCommand(new FakeCommand()).catch(() => undefined);
    expect(gate.refusing).toBe(true);
    handlers.ready();
    expect(gate.refusing).toBe(false);
  });

  it('other errors and successes do not count towards the pause', async () => {
    let n = 0;
    const { client } = fakeClient((c) => {
      n += 1;
      if (n % 2) c.reject(new Error('Command timed out'));
      else c.reject(new Error('ERR wrong number of arguments'));
    });
    const gate = attachFailFast(client as never, { timeoutThreshold: 2 });
    for (let i = 0; i < 6; i += 1) {
      await client.sendCommand(new FakeCommand()).catch(() => undefined);
    }
    expect(gate.refusing).toBe(false);
  });
});

describe('isRedisInfraError', () => {
  it('recognises the gate error and ioredis connection errors, not command errors', () => {
    const retries = new Error('Reached the max retries per request limit');
    retries.name = 'MaxRetriesPerRequestError';
    for (const e of [
      new RedisUnavailableError('disconnected'),
      new Error('Command timed out'),
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
