import { BunnyStreamClient, type BunnyKeys } from './bunny-stream.client';

/**
 * Infra audit 14.11: the 8 s limit covered only the answer's headers — the
 * timer was cleared before the caller read the body, so a Bunny that sent
 * headers and then stalled held the request (and an upload slot) forever.
 * The limit now covers the whole answer.
 */
const keys: BunnyKeys = {
  libraryId: '12345',
  cdnHostname: 'vz.b-cdn.net',
  apiKey: 'test-library-api-key-value',
  tokenAuthKey: 'token-auth-key-0123',
  webhookToken: 'tok_abcdefghijklmnopqrstuvwxyz',
};

describe('BunnyStreamClient time limit (infra audit)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('a body that stalls after the headers fails within the limit', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('{"guid":'));
          init?.signal?.addEventListener('abort', () =>
            ctrl.error(new DOMException('aborted', 'AbortError')),
          );
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const c = new BunnyStreamClient({} as never);
    (c as unknown as { keys: () => Promise<BunnyKeys> }).keys = () =>
      Promise.resolve(keys);
    const read = c.getVideo('vid-1');
    const failed = expect(read).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(10_000);
    await failed;
  });
});
