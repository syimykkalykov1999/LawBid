import { createR2Client } from './r2-client';

/**
 * Infra audit 14.11: the R2 client had no request time limit (the AWS SDK
 * default is none), so a bucket that stopped answering held the request and
 * its socket until the server's own request timeout. SES already sets one;
 * R2 now does the same.
 */
describe('createR2Client time limits (infra audit)', () => {
  it('sets a connection and a request time limit on the HTTP handler', async () => {
    const client = createR2Client({
      accountId: 'test-account',
      accessKeyId: 'test-key-id',
      secretAccessKey: 'test-secret-value',
    });
    const handler = client.config.requestHandler as unknown as {
      configProvider?: Promise<{
        requestTimeout?: number;
        connectionTimeout?: number;
      }>;
      config?: { requestTimeout?: number; connectionTimeout?: number };
    };
    const cfg = handler.config ?? (await handler.configProvider);
    expect(cfg?.requestTimeout).toBeGreaterThan(0);
    expect(cfg?.connectionTimeout).toBeGreaterThan(0);
    client.destroy();
  });
});
