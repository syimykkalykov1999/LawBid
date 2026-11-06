import { S3Client } from '@aws-sdk/client-s3';
import { r2SelfTest } from './r2-self-test';

const F = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'r2accesskeyid0000000000',
  secretAccessKey: 'r2secretaccesskey000000000000000000',
  bucket: 'lawbid-media',
  publicBaseUrl: 'https://media.lawbid.dev',
};

type Answer = (url: string, init: RequestInit) => Response;
const fine: Answer = (_url, init) =>
  init.method === 'OPTIONS'
    ? new Response(null, {
        headers: { 'access-control-allow-origin': 'https://lawbid.dev' },
      })
    : new Response(null, { status: 200 });

function web(answer: Answer = fine) {
  return jest
    .spyOn(global, 'fetch')
    .mockImplementation(((url: string, init: RequestInit) =>
      Promise.resolve(answer(url, init))) as never);
}

describe('«Проверить» for Cloudflare R2 (owner 2026-11-04)', () => {
  let send: jest.SpyInstance;
  beforeEach(() => {
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('does the real flow: signed PUT, public read, delete, probe, CORS', async () => {
    const fetchMock = web();
    await r2SelfTest(F);
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.map(([, i]) => i.method)).toEqual([
      'PUT',
      'HEAD',
      'PUT',
      'OPTIONS',
    ]);
    const [putUrl, putInit] = calls[0];
    expect(putUrl).toContain('lawbid-media.');
    expect(putUrl).toContain('.r2.cloudflarestorage.com/ops/self-test-');
    expect(putUrl).toMatch(/X-Amz-SignedHeaders=[^&]*cache-control/);
    expect(putUrl).toMatch(/X-Amz-SignedHeaders=[^&]*content-length/);
    expect(putUrl).toMatch(/X-Amz-SignedHeaders=[^&]*content-type/);
    expect(putInit.headers).toMatchObject({ 'Content-Type': 'text/plain' });
    expect(calls[1][0]).toMatch(
      /^https:\/\/media\.lawbid\.dev\/ops\/self-test-/,
    );
    expect(calls[2][0]).toContain('/ops/health-probe');
    expect(calls[3][1].headers).toMatchObject({
      Origin: 'https://lawbid.dev',
    });
    expect(
      (send.mock.calls as [object][]).map(([c]) => c.constructor.name),
    ).toEqual(['HeadBucketCommand', 'DeleteObjectsCommand']);
  });

  it('refused keys: says so and writes nothing', async () => {
    send.mockRejectedValueOnce(new Error('Forbidden'));
    const fetchMock = web();
    await expect(r2SelfTest(F)).rejects.toThrow(/не принял ключи.*Forbidden/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a signature the bucket refuses is named as the PUT step', async () => {
    web(() => new Response(null, { status: 403 }));
    await expect(r2SelfTest(F)).rejects.toThrow(/подписанной ссылке.*403/);
  });

  it('the custom domain not connected: tells to connect it', async () => {
    web((_u, i) =>
      i.method === 'HEAD' ? new Response(null, { status: 404 }) : fine(_u, i),
    );
    await expect(r2SelfTest(F)).rejects.toThrow(/подключите свой домен.*404/);
  });

  it('no CORS on the bucket: named as such', async () => {
    web((_u, i) =>
      i.method === 'OPTIONS'
        ? new Response(null, { status: 403 })
        : fine(_u, i),
    );
    await expect(r2SelfTest(F)).rejects.toThrow(/не настроен CORS/);
  });

  it('a domain not named media.<site>: the CORS step is skipped', async () => {
    const fetchMock = web();
    await r2SelfTest({ ...F, publicBaseUrl: 'https://cdn.example.com/' });
    const methods = (fetchMock.mock.calls as [string, RequestInit][]).map(
      ([, i]) => i.method,
    );
    expect(methods).not.toContain('OPTIONS');
  });
});
