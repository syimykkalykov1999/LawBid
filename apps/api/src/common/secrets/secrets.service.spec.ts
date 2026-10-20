import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { demoContext } from '../demo/demo-context';
import { SecretEnvelope } from './secret-envelope';
import { SecretsService } from './secrets.service';

const KEYS = 'k1:0123456789abcdef0123456789abcdef';

function build() {
  const envelope = new SecretEnvelope(KEYS, 'k1');
  const seenDemo: boolean[] = [];
  const row = {
    provider: 'turn',
    version: 1,
    status: 'active',
    enabled: true,
    priority: 0,
    slot: 'main',
    label: null,
    fingerprint: 'fp1',
    public_config: { urls: 'turn:turn.lawbid.dev:3478' },
    secret_enc: envelope.encrypt('{"secret":"s3cret"}', 'turn:1'),
  };
  const prisma = {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRawUnsafe: () => Promise.resolve(0),
        integrationCredential: {
          findMany: () => {
            seenDemo.push(demoContext.isDemo());
            return Promise.resolve([row]);
          },
        },
      }),
    integrationCustomProvider: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaService;
  const config = {
    get: (k: string) =>
      k === 'SECRETS_MASTER_KEYS'
        ? KEYS
        : k === 'SECRETS_ACTIVE_KID'
          ? 'k1'
          : undefined,
  } as unknown as ConfigService;
  const service = new SecretsService(prisma, config, {} as unknown as Redis);
  return { service, seenDemo };
}

describe('SecretsService in the demo world (owner 2026-10-20)', () => {
  it('reads the integration keys from the real database for a demo request', async () => {
    const { service, seenDemo } = build();
    const creds = await demoContext.runDemo(() => service.get('turn'));
    expect(creds?.fields.urls).toBe('turn:turn.lawbid.dev:3478');
    expect(creds?.fields.secret).toBe('s3cret');
    expect(seenDemo).toEqual([false]);
  });

  it('a real request gets the same keys', async () => {
    const { service, seenDemo } = build();
    const creds = await service.get('turn');
    expect(creds?.fields.secret).toBe('s3cret');
    expect(seenDemo).toEqual([false]);
  });
});
