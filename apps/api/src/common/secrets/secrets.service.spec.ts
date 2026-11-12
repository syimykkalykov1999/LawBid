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

// 12.11 (KNOWN_ERRORS 110): the «Запуск» page fired ~165 key-store
// transactions at once; one P2028 switched the whole process to env keys
// for a minute.
describe('SecretsService under a burst (single-flight)', () => {
  function burst(opts: { failFirst?: number } = {}) {
    const envelope = new SecretEnvelope(KEYS, 'k1');
    let tx = 0;
    let fail = opts.failFirst ?? 0;
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
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        tx++;
        if (fail > 0) {
          fail--;
          throw Object.assign(new Error('Unable to start a transaction'), {
            code: 'P2028',
          });
        }
        return fn({
          $executeRawUnsafe: () => Promise.resolve(0),
          integrationCredential: { findMany: () => Promise.resolve([row]) },
        });
      },
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
    return { service, txCount: () => tx };
  }

  it('165 concurrent reads of a cold cache open one transaction', async () => {
    const { service, txCount } = burst();
    const all = await Promise.all(
      Array.from({ length: 165 }, () => service.get('turn')),
    );
    expect(all.every((c) => c?.fields.secret === 's3cret')).toBe(true);
    expect(txCount()).toBe(1);
  });

  it('a busy pool (P2028) is retried once and does not stop the key store', async () => {
    const { service, txCount } = burst({ failFirst: 1 });
    const creds = await service.get('turn');
    expect(creds?.fields.secret).toBe('s3cret');
    expect(txCount()).toBe(2);
  });

  it('still busy after the retry: no empty answer is cached, the next read hits the store', async () => {
    const { service, txCount } = burst({ failFirst: 2 });
    await service.get('turn');
    const again = await service.get('turn');
    expect(again?.fields.secret).toBe('s3cret');
    expect(txCount()).toBe(3);
  });
});
