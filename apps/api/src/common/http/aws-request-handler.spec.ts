import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { KMSClient, ListKeysCommand } from '@aws-sdk/client-kms';
import {
  AWS_API_REQUEST_HANDLER,
  awsRequestHandler,
  STORAGE_REQUEST_HANDLER,
} from './aws-request-handler';

/** A server that accepts the connection and never answers (a half-open
 * AWS endpoint as seen from the client). */
const sockets: Socket[] = [];
function silentServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((s) => {
    sockets.push(s);
    s.on('error', () => undefined);
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({ server, port: (server.address() as AddressInfo).port }),
    ),
  );
}

function client(port: number, requestHandler: object): KMSClient {
  return new KMSClient({
    region: 'us-east-1',
    endpoint: `http://127.0.0.1:${port}`,
    credentials: { accessKeyId: 'test-key-id', secretAccessKey: 'test-secret' },
    maxAttempts: 1,
    requestHandler,
  });
}

describe('AWS request handler limits (M5)', () => {
  let server: Server;
  let port: number;
  beforeAll(async () => ({ server, port } = await silentServer()));
  afterAll(() => {
    // close() waits for open connections; the silent ones never end.
    sockets.forEach((s) => s.destroy());
    return new Promise((ok) => server.close(ok));
  });

  it('a hung AWS endpoint fails with TimeoutError on our limit', async () => {
    const c = client(port, awsRequestHandler(300));
    const started = Date.now();
    await expect(c.send(new ListKeysCommand({}))).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(Date.now() - started).toBeLessThan(3_000);
    c.destroy();
  });

  it('requestTimeout alone (the old shape) does not end the call', async () => {
    // The reason for throwOnRequestTimeout: without it the SDK only warns.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const c = client(port, { requestTimeout: 200, connectionTimeout: 200 });
    const ac = new AbortController();
    const outcome = c
      .send(new ListKeysCommand({}), { abortSignal: ac.signal })
      .then(
        () => 'answered',
        (e: Error) => (ac.signal.aborted ? 'still waiting' : e.name),
      );
    await new Promise((r) => setTimeout(r, 1_000));
    ac.abort();
    expect(await outcome).toBe('still waiting');
    c.destroy();
    warn.mockRestore();
  });

  it('shared limits: API calls end in 10 s, storage gives up after 30 s idle', () => {
    expect(AWS_API_REQUEST_HANDLER).toEqual({
      connectionTimeout: 3_000,
      socketTimeout: 10_000,
      requestTimeout: 10_000,
      throwOnRequestTimeout: true,
    });
    expect(STORAGE_REQUEST_HANDLER).toEqual({
      connectionTimeout: 3_000,
      socketTimeout: 30_000,
    });
    expect(awsRequestHandler(2_500).connectionTimeout).toBe(2_500);
  });
});
