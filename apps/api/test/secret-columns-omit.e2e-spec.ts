import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { shardContext } from '../src/sharding/shard-context';

/**
 * STAGE2_SECURITY S10 (#17, ASVS V8.2.3 / V15.3.1): the application's
 * Prisma client never returns a secret column unless the query asks for it
 * (Prisma's global `omit`, src/prisma/secret-columns.ts). Real PostgreSQL,
 * through the same PrismaService the app injects: plain reads, writes,
 * `include`, `$transaction` and the per-user client of the sharded proxy.
 */
describe('secret columns are omitted by default (real PostgreSQL)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaService();
  const userId = randomUUID();
  const phone = `+1555${String(Date.now()).slice(-7)}`;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        role: 'client',
        phone_e164: phone,
        password_hash: 'test-password-hash-value',
        identifiers: {
          create: { provider: 'phone', provider_uid: phone },
        },
        admin_credential: {
          create: {
            totp_secret_enc: 'test-totp-secret-value',
            recovery_codes_hash: ['test-recovery-hash'],
            password_hash: 'test-admin-password-hash',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.adminCredential.deleteMany({ where: { user_id: userId } });
    await prisma.userIdentifier.deleteMany({ where: { user_id: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('a user read without select has no password_hash', async () => {
    const byId = await prisma.user.findUnique({ where: { id: userId } });
    expect(byId).not.toBeNull();
    expect(byId).not.toHaveProperty('password_hash');
    const many = await prisma.user.findMany({ where: { id: userId } });
    expect(many[0]).not.toHaveProperty('password_hash');
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { first_name: 'Omit' },
    });
    expect(updated).not.toHaveProperty('password_hash');
  });

  it('rows an include brings are omitted too', async () => {
    const ident = await prisma.userIdentifier.findFirst({
      where: { provider: 'phone', provider_uid: phone },
      include: { user: { include: { admin_credential: true } } },
    });
    expect(ident?.user).not.toHaveProperty('password_hash');
    const cred = ident?.user.admin_credential;
    expect(cred).toBeTruthy();
    for (const column of [
      'totp_secret_enc',
      'recovery_codes_hash',
      'password_hash',
      'security_answer_hash',
    ]) {
      expect(cred).not.toHaveProperty(column);
    }
  });

  it('a transaction and the per-user client omit the same columns', async () => {
    const inTx = await prisma.$transaction((tx) =>
      tx.user.findUnique({ where: { id: userId } }),
    );
    expect(inTx).not.toHaveProperty('password_hash');
    const routed = await prisma
      .forUser(userId)
      .user.findUnique({ where: { id: userId } });
    expect(routed).not.toHaveProperty('password_hash');
    const inContext = await shardContext.runForUser(userId, () =>
      prisma.user.findFirst({ where: { id: userId } }),
    );
    expect(inContext).not.toHaveProperty('password_hash');
  });

  it('a reader that needs the secret asks for it explicitly', async () => {
    const withOmit = await prisma.user.findUnique({
      where: { id: userId },
      omit: { password_hash: false },
    });
    expect(withOmit?.password_hash).toBe('test-password-hash-value');
    const selected = await prisma.adminCredential.findUnique({
      where: { user_id: userId },
      select: { totp_secret_enc: true, recovery_codes_hash: true },
    });
    expect(selected).toEqual({
      totp_secret_enc: 'test-totp-secret-value',
      recovery_codes_hash: ['test-recovery-hash'],
    });
  });
});
