import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * docs/02_DATABASE.md §8, stage 2.2 acceptance, against a real
 * CockroachDB (the per-run e2e database, see test/support/e2e-env.ts):
 * email/phone uniqueness with multiple NULLs allowed, identifier UQ,
 * creating a session and an auth event. Plus the files table added here.
 */
describe('DB schema — stage 2.2 acceptance', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Prisma's unique-constraint error code.
  const UNIQUE_VIOLATION = { code: 'P2002' };

  it('allows many users with NULL email and phone', async () => {
    await prisma.user.createMany({
      data: [{ role: 'client' }, { role: 'client' }, { role: 'attorney' }],
    });
    const nulls = await prisma.user.count({
      where: { email: null, phone_e164: null },
    });
    expect(nulls).toBeGreaterThanOrEqual(3);
  });

  it('rejects a duplicate email', async () => {
    const email = `dup-${randomUUID()}@example.com`;
    await prisma.user.create({ data: { email } });
    await expect(prisma.user.create({ data: { email } })).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
  });

  it('rejects a duplicate phone_e164', async () => {
    const phone_e164 = '+12025559001';
    await prisma.user.create({ data: { phone_e164 } });
    await expect(
      prisma.user.create({ data: { phone_e164 } }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('rejects the same (provider, provider_uid) on two users', async () => {
    const [a, b] = await Promise.all([
      prisma.user.create({ data: {} }),
      prisma.user.create({ data: {} }),
    ]);
    const provider_uid = `apple-sub-${randomUUID()}`;
    await prisma.userIdentifier.create({
      data: { user_id: a.id, provider: 'apple', provider_uid },
    });
    await expect(
      prisma.userIdentifier.create({
        data: { user_id: b.id, provider: 'apple', provider_uid },
      }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('creates a session and an auth event for a user', async () => {
    const user = await prisma.user.create({ data: { role: 'client' } });
    const session = await prisma.session.create({
      data: {
        user_id: user.id,
        session_chain_id: randomUUID(),
        device_id: 'test-device',
        platform: 'ios',
        refresh_hash: `hash-${randomUUID()}`,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });
    const event = await prisma.authEvent.create({
      data: {
        user_id: user.id,
        event_type: 'login_success',
        success: true,
        device_id: 'test-device',
        meta: { sessionId: session.id },
      },
    });
    expect(session.user_id).toBe(user.id);
    expect(event.user_id).toBe(user.id);
  });

  it('stores a file, links it as avatar, and keeps s3_key unique', async () => {
    const owner = await prisma.user.create({ data: {} });
    const s3_key = `avatars/${randomUUID()}.jpg`;
    const file = await prisma.file.create({
      data: {
        owner_user_id: owner.id,
        purpose: 'avatar',
        s3_bucket: 'lawbid-media',
        s3_key,
        mime: 'image/jpeg',
        size_bytes: 1024n,
        sha256: 'a'.repeat(64),
      },
    });
    expect(file.scan_status).toBe('pending');
    expect(file.is_public).toBe(false);

    await prisma.user.update({
      where: { id: owner.id },
      data: { avatar_file_id: file.id },
    });
    await expect(
      prisma.file.create({
        data: {
          owner_user_id: owner.id,
          purpose: 'avatar',
          s3_bucket: 'lawbid-media',
          s3_key,
          mime: 'image/jpeg',
          size_bytes: 1n,
          sha256: 'b'.repeat(64),
        },
      }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });
});
