import { EngineError, OpenSearchClient } from './opensearch.client';

function res(status: number, body: unknown = {}): Response {
  return {
    status,
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function make(
  fetchImpl: jest.Mock,
  env: Record<string, string> = { OPENSEARCH_URL: 'http://es:9200/' },
) {
  return new OpenSearchClient(
    undefined,
    { get: (k: string) => env[k] },
    fetchImpl,
  );
}

describe('OpenSearchClient', () => {
  it('is not configured without an address; Integrations win over env', async () => {
    expect(await make(jest.fn(), {}).isConfigured()).toBe(false);
    const c = new OpenSearchClient(
      {
        get: () =>
          Promise.resolve({
            fields: { url: 'https://vpc-x.es.amazonaws.com/', prefix: 'lb2' },
          }),
      } as never,
      { get: () => 'http://env:9200' },
    );
    expect(await c.creds()).toMatchObject({
      url: 'https://vpc-x.es.amazonaws.com',
      prefix: 'lb2',
    });
  });

  it('sends Basic auth only when both name and password are set', async () => {
    const f = jest.fn().mockResolvedValue(res(200));
    await make(f, {
      OPENSEARCH_URL: 'http://es',
      OPENSEARCH_USERNAME: 'u',
      OPENSEARCH_PASSWORD: 'p',
    }).ping();
    expect(f.mock.calls[0][1].headers.authorization).toBe(
      `Basic ${Buffer.from('u:p').toString('base64')}`,
    );
    const g = jest.fn().mockResolvedValue(res(200));
    await make(g).ping();
    expect(g.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it('bulk: index and delete lines, ndjson, idempotent ids; 404 on delete is fine', async () => {
    const f = jest.fn().mockResolvedValue(
      res(200, {
        items: [
          { index: { status: 201 } },
          { delete: { status: 404 } },
          { index: { status: 400, error: { reason: 'mapper_parsing' } } },
        ],
      }),
    );
    const out = await make(f).bulk([
      { entity: 'post', id: 'a', doc: { body: 'x' } },
      { entity: 'post', id: 'b', doc: null },
      { entity: 'case', id: 'c', doc: { title: 't' } },
    ]);
    const [url, init] = f.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('http://es:9200/_bulk');
    expect(init.headers['content-type']).toBe('application/x-ndjson');
    expect(init.body.split('\n')).toEqual([
      '{"index":{"_index":"lawbid-post-v1","_id":"a"}}',
      '{"body":"x"}',
      '{"delete":{"_index":"lawbid-post-v1","_id":"b"}}',
      '{"index":{"_index":"lawbid-case-v1","_id":"c"}}',
      '{"title":"t"}',
      '',
    ]);
    expect(out.failed).toEqual([
      { entity: 'case', id: 'c', reason: 'mapper_parsing' },
    ]);
  });

  it('bulk with nothing to do does not call the engine', async () => {
    const f = jest.fn();
    expect((await make(f).bulk([])).failed).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('searchIds returns ids best first; a missing index is an empty answer', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(
        res(200, { hits: { hits: [{ _id: '1' }, { _id: '2' }] } }),
      )
      .mockResolvedValueOnce(res(404));
    const c = make(f);
    expect(await c.searchIds('post', { match_all: {} }, 10, 500)).toEqual([
      '1',
      '2',
    ]);
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
      size: 10,
      _source: false,
    });
    expect(await c.searchIds('post', { match_all: {} }, 10, 500)).toEqual([]);
  });

  it('a server error or an unreachable engine is an EngineError', async () => {
    await expect(
      make(jest.fn().mockResolvedValue(res(503))).searchIds('post', {}, 1, 100),
    ).rejects.toBeInstanceOf(EngineError);
    await expect(
      make(jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))).ping(),
    ).rejects.toThrow(/unreachable/);
  });

  it('times out with a clear message', async () => {
    const f = jest.fn(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_r, rej) =>
          init.signal.addEventListener('abort', () =>
            rej(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          ),
        ),
    );
    await expect(make(f as never).searchIds('post', {}, 1, 20)).rejects.toThrow(
      /timeout after 20 ms/,
    );
  });

  it('ensureIndex creates once (HEAD 404 then PUT) and sets replicas', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(200))
      .mockResolvedValueOnce(res(200));
    const c = make(f);
    expect(await c.ensureIndex('tag', 1)).toBe(true);
    expect(f.mock.calls[1][0]).toBe('http://es:9200/lawbid-tag-v1');
    expect(
      JSON.parse(f.mock.calls[1][1].body).settings.number_of_replicas,
    ).toBe(1);
    expect(await c.ensureIndex('tag')).toBe(false);
  });
});
