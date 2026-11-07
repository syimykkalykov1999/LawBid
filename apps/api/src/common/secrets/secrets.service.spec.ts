import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { demoContext } from '../demo/demo-context';
import { SecretEnvelope } from './secret-envelope';
import { SecretsService } from './secrets.service';
import {
  brokenRedis,
  fakeSubscriber,
  redisWithSubscriber,
} from '../../redis/subscribe-in-background.test-support';

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

describe('SecretsService.reencryptStores', () => {
  function setup(rows: Array<{ id: string; join_code_enc: string | null }>) {
    const wheres: unknown[] = [];
    const prisma = {
      assistantMembership: {
        findMany: jest.fn((args: { where: unknown }) => {
          wheres.push(args.where);
          return Promise.resolve(wheres.length === 1 ? rows : []);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stateBarRegistry: { findMany: () => Promise.resolve([]) },
      adminCredential: { findMany: () => Promise.resolve([]) },
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
    return { service, wheres };
  }

  it('never filters a uuid column by an empty string on the first page', async () => {
    const { service, wheres } = setup([]);
    await service.reencryptStores();
    const first = JSON.stringify(wheres[0]);
    expect(first).not.toContain('"gt":""');
    expect(wheres[0]).not.toHaveProperty('id');
  });

  it('pages with the last id as the cursor, a real uuid', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      join_code_enc: 'plain:X',
    }));
    const { service, wheres } = setup(rows);
    await service.reencryptStores();
    expect(wheres).toHaveLength(2);
    expect((wheres[1] as { id: { gt: string } }).id.gt).toBe(rows[199].id);
  });
});

describe('SecretsService without Redis', () => {
  const make = (redis: Redis) =>
    new SecretsService(
      { integrationCredential: {} } as unknown as PrismaService,
      { get: () => undefined } as unknown as ConfigService,
      redis,
    );

  it('onModuleInit returns while SUBSCRIBE still waits; the handler is wired; shutdown drops the client', async () => {
    const { sub, handlers } = fakeSubscriber();
    const service = make(redisWithSubscriber(sub));
    service.onModuleInit(); // synchronous by type
    expect(sub.subscribe).toHaveBeenCalledWith(expect.any(String));
    expect(handlers).toHaveLength(1);
    await service.onModuleDestroy();
    expect(sub.disconnect).toHaveBeenCalled();
  });

  it('a duplicate() that throws degrades to «pub/sub unavailable», never a failed boot', () => {
    expect(() => make(brokenRedis()).onModuleInit()).not.toThrow();
  });
});
