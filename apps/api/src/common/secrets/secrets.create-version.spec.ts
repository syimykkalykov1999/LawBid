import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { SecretEnvelope } from './secret-envelope';
import { SecretsService } from './secrets.service';

const KEYS = 'k1:0123456789abcdef0123456789abcdef';

// 10.11: the TURN card kept a dead fixed address (54.83.172.171) and the
// on-demand relay never started, because a blank field always kept the old
// value and `urls` was required. A cleared public field must clear.
function build() {
  const envelope = new SecretEnvelope(KEYS, 'k1');
  const row = {
    provider: 'turn',
    version: 2,
    status: 'active',
    enabled: true,
    priority: 0,
    slot: 'main',
    label: null,
    kid: 'k1',
    fingerprint: 'fp',
    public_config: { urls: 'turn:54.83.172.171:3478' },
    secret_enc: envelope.encrypt('{"secret":"test-turn-shared-secret"}', 'turn:2'),
  };
  const created: {
    public_config?: Record<string, string>;
    secret_enc?: string;
    version?: number;
  }[] = [];
  const prisma = {
    integrationCredential: {
      findFirst: () => Promise.resolve(row),
      create: ({ data }: { data: (typeof created)[number] }) => {
        created.push(data);
        return Promise.resolve({ ...row, ...data, id: 'new' });
      },
    },
    integrationCustomProvider: {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
    },
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
  const secretOf = (i: number) =>
    JSON.parse(
      envelope.decrypt(created[i].secret_enc!, `turn:${created[i].version}`),
    ) as Record<string, string>;
  return { service, created, secretOf };
}

describe('SecretsService.createVersion: blank vs cleared fields', () => {
  it('a field left out keeps its value; a blank secret keeps the secret', async () => {
    const { service, created, secretOf } = build();
    await service.createVersion('turn', { secret: '' }, null);
    expect(created[0].public_config).toEqual({
      urls: 'turn:54.83.172.171:3478',
    });
    expect(secretOf(0)).toEqual({ secret: 'test-turn-shared-secret' });
  });

  it('a public field sent empty is cleared (TURN: on-demand relay instead of a fixed address)', async () => {
    const { service, created, secretOf } = build();
    await service.createVersion('turn', { urls: '' }, null);
    expect(created[0].public_config).toEqual({});
    expect(secretOf(0)).toEqual({ secret: 'test-turn-shared-secret' });
  });
});
