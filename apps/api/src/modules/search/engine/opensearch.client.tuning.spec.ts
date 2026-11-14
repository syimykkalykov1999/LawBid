import {
  ENGINE_TUNING_DEFAULTS,
  OpenSearchClient,
  createOpenSearchClient,
  type EngineTuning,
} from './opensearch.client';

// 14.11 prod F5: the per-call timeout was a fixed 5000 ms and there was no
// retry. Both are admin settings now (search.engine_request_timeout_ms,
// search.engine_max_retries), read on every call; defaults equal today.

function res(status: number, body: unknown = {}): Response {
  return {
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** fetch that never answers until its AbortSignal fires. */
function hanging(): jest.Mock {
  return jest.fn(
    (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_, rej) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          rej(e);
        });
      }),
  );
}

function make(fetchImpl: jest.Mock, tuning: EngineTuning): OpenSearchClient {
  return new OpenSearchClient(
    undefined,
    { get: (k: string) => (k === 'OPENSEARCH_URL' ? 'http://es:9200' : '') },
    fetchImpl,
    undefined,
    undefined,
    undefined,
    () => Promise.resolve(tuning),
  );
}

describe('OpenSearchClient tuning (14.11 F5)', () => {
  it('defaults are today: 5000 ms, no retry', () => {
    expect(ENGINE_TUNING_DEFAULTS).toEqual({
      requestTimeoutMs: 5000,
      maxRetries: 0,
    });
  });

  it('a call without its own time waits search.engine_request_timeout_ms', async () => {
    const c = make(hanging(), { requestTimeoutMs: 30, maxRetries: 0 });
    await expect(c.mappingVersion('lawbid-attorneys-v1')).rejects.toThrow(
      'search engine timeout after 30 ms',
    );
  });

  it('a dropped connection on a read is retried search.engine_max_retries times', async () => {
    const f = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        res(200, { i: { mappings: { _meta: { mapping_version: 7 } } } }),
      );
    expect(
      await make(f, { requestTimeoutMs: 1000, maxRetries: 1 }).mappingVersion(
        'i',
      ),
    ).toBe(7);
    expect(f).toHaveBeenCalledTimes(2);

    const none = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      make(none, { requestTimeoutMs: 1000, maxRetries: 0 }).mappingVersion('i'),
    ).rejects.toThrow('search engine unreachable');
    expect(none).toHaveBeenCalledTimes(1);
  });

  it('a timeout is retried too, then gives up', async () => {
    const f = hanging();
    await expect(
      make(f, { requestTimeoutMs: 20, maxRetries: 2 }).mappingVersion('i'),
    ).rejects.toThrow('search engine timeout after 20 ms');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('never repeats a reindex start, never repeats an HTTP answer', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      make(f, { requestTimeoutMs: 1000, maxRetries: 3 }).startReindexTask(
        'a',
        'b',
        0,
      ),
    ).rejects.toThrow('search engine unreachable');
    expect(f).toHaveBeenCalledTimes(1);

    const busy = jest.fn().mockResolvedValue(res(503, {}));
    await expect(
      make(busy, { requestTimeoutMs: 1000, maxRetries: 3 }).layout(),
    ).rejects.toThrow('layout failed (503)');
    // two paths (indices + aliases), one try each
    expect(busy).toHaveBeenCalledTimes(2);
  });

  it('createOpenSearchClient reads both settings live on every call', async () => {
    const values: Record<string, number> = {
      'search.engine_request_timeout_ms': 25,
      'search.engine_max_retries': 0,
    };
    const settings = {
      string: () => Promise.resolve('domain'),
      number: (k: string) => Promise.resolve(values[k]),
    };
    const realFetch = global.fetch;
    const f = hanging();
    global.fetch = f;
    try {
      // createOpenSearchClient binds global fetch at build time.
      const live = createOpenSearchClient(
        undefined,
        {
          get: (k: string) => (k === 'OPENSEARCH_URL' ? 'http://es:9200' : ''),
        },
        settings,
      );
      await expect(live.mappingVersion('i')).rejects.toThrow('after 25 ms');
      values['search.engine_request_timeout_ms'] = 40;
      values['search.engine_max_retries'] = 1;
      await expect(live.mappingVersion('i')).rejects.toThrow('after 40 ms');
      expect(f).toHaveBeenCalledTimes(3);
    } finally {
      global.fetch = realFetch;
    }
  });
});
