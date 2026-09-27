import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { RateLimitService } from '../src/modules/auth/services/rate-limit.service';
import { SessionService } from '../src/modules/auth/services/session.service';
import type { TokenService } from '../src/modules/auth/services/token.service';
import type { SessionRevocationService } from '../src/modules/auth/services/session-revocation.service';
import type { AuthEventService } from '../src/modules/auth/services/auth-event.service';

/**
 * docs/01 §10.6 new-device signal / docs/02 §5: SessionService.isNewDevice
 * runs on every login. The EXPLAIN is taken of the EXACT SQL Prisma
 * generates for it (captured from the query log while the real service
 * method runs), after ANALYZE, and must not FULL SCAN sessions.
 */
describe('DB sessions — (user_id, device_id) lookup (e2e)', () => {
  // App boot + CockroachDB fixtures exceed Jest's 5 s default under load.
  jest.setTimeout(60_000);

  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  const captured: { query: string; params: string }[] = [];
  prisma.$on('query', (e) =>
    captured.push({ query: e.query, params: e.params }),
  );
  const sessions = new SessionService(
    prisma as unknown as PrismaService,
    {} as TokenService,
    {} as SessionRevocationService,
    {} as AuthEventService,
    {} as ConfigService,
    {} as RateLimitService,
  );
  let userIds: string[] = [];

  beforeAll(async () => {
    // Enough rows across enough users that a full scan is clearly the
    // expensive plan for the optimizer.
    const users = await Promise.all(
      Array.from({ length: 40 }, () => prisma.user.create({ data: {} })),
    );
    userIds = users.map((u) => u.id);
    const expires = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: userIds.flatMap((user_id, u) =>
        Array.from({ length: 10 }, (_, d) => ({
          user_id,
          session_chain_id: randomUUID(),
          device_id: `dev-${u}-${d % 3}`,
          refresh_hash: randomBytes(24).toString('hex'),
          expires_at: expires,
          revoked_at: d % 2 === 0 ? new Date() : null,
          revoked_reason: d % 2 === 0 ? 'rotated' : null,
        })),
      ),
    });
    await prisma.$executeRawUnsafe('ANALYZE sessions');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('answers correctly (revoked sessions still count as a known device)', async () => {
    await expect(sessions.isNewDevice(userIds[0], 'dev-0-0')).resolves.toBe(
      false,
    );
    await expect(sessions.isNewDevice(userIds[0], 'dev-0-2')).resolves.toBe(
      false,
    );
    await expect(sessions.isNewDevice(userIds[0], 'dev-1-0')).resolves.toBe(
      true,
    );
    await expect(sessions.isNewDevice(userIds[0], undefined)).resolves.toBe(
      false,
    );
  });

  it('EXPLAIN of the exact isNewDevice query uses the (user_id, device_id) index, no FULL SCAN', async () => {
    captured.length = 0;
    await sessions.isNewDevice(userIds[7], 'dev-7-1');
    const lookup = captured.find((c) =>
      /FROM "public"\."sessions"/.test(c.query),
    );
    expect(lookup).toBeDefined();
    const { query, params } = lookup!;
    expect(query).toMatch(/"user_id" = \$1 AND .*"device_id" = \$2/);

    const plan = await prisma.$queryRawUnsafe<{ info: string }[]>(
      `EXPLAIN ${query}`,
      ...(JSON.parse(params) as unknown[]),
    );
    const text = plan.map((r) => r.info).join('\n');
    expect(text).not.toMatch(/FULL SCAN/);
    expect(text).toContain('sessions@sessions_user_id_device_id_idx');
  });

  it('the index exists with the expected columns', async () => {
    const rows = await prisma.$queryRawUnsafe<
      { column_name: string; seq_in_index: bigint; implicit: boolean }[]
    >(
      `SELECT column_name, seq_in_index, implicit FROM [SHOW INDEXES FROM sessions]
       WHERE index_name = 'sessions_user_id_device_id_idx' AND NOT implicit
       ORDER BY seq_in_index`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(['user_id', 'device_id']);
  });
});
