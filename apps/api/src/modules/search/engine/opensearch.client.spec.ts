import {
  EngineError,
  OpenSearchClient,
  createOpenSearchClient,
} from './opensearch.client';

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

  /** `_cat` answers of a layout: person has v1 (read+write) and v2 (new). */
  const catIndices = [
    { index: 'lawbid-post-v1', 'docs.count': '7', 'store.size': '100' },
    { index: 'lawbid-post-v2', 'docs.count': '5', 'store.size': '50' },
    { index: 'lawbid-case-v1', 'docs.count': '3', 'store.size': '10' },
  ];
  const catAliases = [
    { alias: 'lawbid-post', index: 'lawbid-post-v1' },
    { alias: 'lawbid-post-write', index: 'lawbid-post-v1' },
    { alias: 'lawbid-case', index: 'lawbid-case-v1' },
    { alias: 'lawbid-case-write', index: 'lawbid-case-v1' },
  ];
  const layoutCalls = () => [res(200, catIndices), res(200, catAliases)];

  it('layout: generations, doc counts and where the two aliases point', async () => {
    const f = jest.fn();
    layoutCalls().forEach((r) => f.mockResolvedValueOnce(r));
    const l = await make(f).layout();
    const post = l.find((x) => x.entity === 'post')!;
    expect(post.indexes.map((i) => [i.generation, i.docs])).toEqual([
      [1, 7],
      [2, 5],
    ]);
    expect(post.readTarget).toBe('lawbid-post-v1');
    expect(post.writeTarget).toBe('lawbid-post-v1');
    expect(l.find((x) => x.entity === 'tag')!.readTarget).toBeNull();
  });

  it('bulk: documents go to the write alias plus dual-write targets, with an external version', async () => {
    const f = jest.fn();
    layoutCalls().forEach((r) => f.mockResolvedValueOnce(r));
    f.mockResolvedValueOnce(
      res(200, {
        items: [
          { index: { status: 201 } },
          { index: { status: 201 } },
          { index: { status: 409 } },
        ],
      }),
    );
    const out = await make(f).bulk(
      [{ entity: 'post', id: 'a', doc: { body: 'x' }, version: 5 }],
      { post: ['lawbid-post-v2'] },
    );
    const [url, init] = f.mock.calls[2] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('http://es:9200/_bulk');
    expect(init.headers['content-type']).toBe('application/x-ndjson');
    const lines = init.body.split('\n');
    expect(JSON.parse(lines[0]).index).toEqual({
      _index: 'lawbid-post-write',
      _id: 'a',
      version: 5,
      version_type: 'external_gte',
    });
    expect(JSON.parse(lines[2]).index._index).toBe('lawbid-post-v2');
    expect(lines[1]).toBe('{"body":"x"}');
    expect(out.failed).toEqual([]); // 409 = a newer version is already there
  });

  it('bulk: a delete reaches EVERY generation of the entity (GDPR)', async () => {
    const f = jest.fn();
    layoutCalls().forEach((r) => f.mockResolvedValueOnce(r));
    f.mockResolvedValueOnce(
      res(200, {
        items: [
          { delete: { status: 200 } },
          { delete: { status: 404 } },
          { index: { status: 400, error: { reason: 'mapper_parsing' } } },
        ],
      }),
    );
    const out = await make(f).bulk([
      { entity: 'post', id: 'b', doc: null },
      { entity: 'case', id: 'c', doc: { title: 't' } },
    ]);
    const body = (f.mock.calls[2][1] as { body: string }).body
      .trim()
      .split('\n');
    const deletes = body
      .filter((l) => l.startsWith('{"delete"'))
      .map(
        (l) => (JSON.parse(l) as { delete: { _index: string } }).delete._index,
      );
    expect(deletes.sort()).toEqual(['lawbid-post-v1', 'lawbid-post-v2']);
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

  it('bootstrap on an empty engine: templates, then v1 with both aliases', async () => {
    const f = jest.fn().mockResolvedValue(res(200, []));
    const c = make(f);
    const done = await c.bootstrap(1);
    expect(done).toHaveLength(5);
    const put = f.mock.calls.filter((x) => x[1].method === 'PUT');
    expect(put.some((x) => String(x[0]).includes('/_index_template/'))).toBe(
      true,
    );
    const idx = put.find((x) => x[0] === 'http://es:9200/lawbid-tag-v1')!;
    const body = JSON.parse(idx[1].body);
    expect(body.aliases['lawbid-tag']).toEqual({});
    expect(body.aliases['lawbid-tag-write']).toEqual({ is_write_index: true });
    expect(body.settings.number_of_replicas).toBe(1);
  });

  it('bootstrap adopts a pre-alias index by adding aliases (no data moves)', async () => {
    const f = jest.fn();
    f.mockResolvedValueOnce(
      res(200, [{ index: 'lawbid-case-v1', 'docs.count': '3' }]),
    );
    f.mockResolvedValueOnce(res(200, []));
    f.mockResolvedValue(res(200, {}));
    // only `case` has an index; the other four are created too
    const c = make(f);
    await c.bootstrap();
    const alias = f.mock.calls.find((x) => x[0] === 'http://es:9200/_aliases')!;
    expect(JSON.parse(alias[1].body).actions).toEqual([
      { add: { index: 'lawbid-case-v1', alias: 'lawbid-case' } },
      {
        add: {
          index: 'lawbid-case-v1',
          alias: 'lawbid-case-write',
          is_write_index: true,
        },
      },
    ]);
  });

  it('swap is ONE atomic _aliases call: remove from the old, add to the new', async () => {
    const f = jest.fn().mockResolvedValue(res(200, { acknowledged: true }));
    await make(f).swap([
      {
        entity: 'post',
        which: 'read',
        from: 'lawbid-post-v1',
        to: 'lawbid-post-v2',
      },
      {
        entity: 'case',
        which: 'write',
        from: 'lawbid-case-v1',
        to: 'lawbid-case-v2',
      },
    ]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.mock.calls[0][1].body).actions).toEqual([
      { remove: { index: 'lawbid-post-v1', alias: 'lawbid-post' } },
      { add: { index: 'lawbid-post-v2', alias: 'lawbid-post' } },
      { remove: { index: 'lawbid-case-v1', alias: 'lawbid-case-write' } },
      {
        add: {
          index: 'lawbid-case-v2',
          alias: 'lawbid-case-write',
          is_write_index: true,
        },
      },
    ]);
  });

  it('deleteIndex refuses an index that still carries an alias, and wildcards', async () => {
    const f = jest.fn();
    layoutCalls().forEach((r) => f.mockResolvedValueOnce(r));
    await expect(make(f).deleteIndex('lawbid-post-v1')).rejects.toThrow(
      /still has an alias/,
    );
    await expect(make(jest.fn()).deleteIndex('lawbid-*')).rejects.toThrow(
      /refusing/,
    );
    const g = jest.fn();
    layoutCalls().forEach((r) => g.mockResolvedValueOnce(r));
    g.mockResolvedValueOnce(res(200));
    await make(g).deleteIndex('lawbid-post-v2');
    expect(g.mock.calls[2][0]).toBe('http://es:9200/lawbid-post-v2');
  });

  it('searches go through the READ alias', async () => {
    const f = jest.fn().mockResolvedValue(res(200, { hits: { hits: [] } }));
    await make(f).searchIds('tag', {}, 5, 100);
    expect(f.mock.calls[0][0]).toBe('http://es:9200/lawbid-tag/_search');
  });
});

describe('createOpenSearchClient (engine kinds)', () => {
  const env: Record<string, string> = {
    OPENSEARCH_URL: 'https://vpc-d.es.amazonaws.com/',
    OPENSEARCH_SERVERLESS_URL: 'https://abc.us-east-1.aoss.amazonaws.com',
    OPENSEARCH_REPLICAS: '1',
    AWS_REGION: 'us-east-1',
  };
  const config = { get: (k: string) => env[k] };

  it('domain is the default: its url, replicas, no signing', async () => {
    const c = createOpenSearchClient(undefined, config, {
      string: () => Promise.resolve('domain'),
    });
    expect(await c.creds()).toMatchObject({
      kind: 'domain',
      url: 'https://vpc-d.es.amazonaws.com',
      replicas: 1,
    });
    const none = createOpenSearchClient(undefined, config);
    expect((await none.creds())?.kind).toBe('domain');
  });

  it('serverless uses its own url, zero replicas', async () => {
    const c = createOpenSearchClient(undefined, config, {
      string: () => Promise.resolve('serverless'),
    });
    expect(await c.creds()).toMatchObject({
      kind: 'serverless',
      url: 'https://abc.us-east-1.aoss.amazonaws.com',
      replicas: 0,
    });
  });

  it('serverless requests are SigV4-signed for aoss; domain ones are not', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res(200, []));
    const mk = (kind: 'domain' | 'serverless') =>
      new OpenSearchClient(
        undefined,
        config,
        fetchImpl,
        () => Promise.resolve(kind),
        () => Promise.resolve({ accessKeyId: 'AK', secretAccessKey: 'SK' }),
        () => new Date('2026-10-25T00:00:00Z'),
      );
    await mk('serverless').ping();
    const sh = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(sh.authorization).toContain('/us-east-1/aoss/aws4_request');
    expect(sh['x-amz-content-sha256']).toBeDefined();
    await mk('domain').ping();
    const dh = fetchImpl.mock.calls[1][1].headers as Record<string, string>;
    expect(dh.authorization).toBeUndefined();
  });

  it('serverless fails clearly without AWS credentials', async () => {
    const c = new OpenSearchClient(
      undefined,
      config,
      jest.fn(),
      () => Promise.resolve('serverless'),
      () => Promise.resolve(null),
    );
    await expect(c.ping()).rejects.toThrow(/credentials/);
  });
});
