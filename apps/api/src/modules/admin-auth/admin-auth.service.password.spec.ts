import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { hashSecret } from './admin-password.util';
import type { AdminActor } from './admin-auth.decorators';

const KEY = 'k'.repeat(40);

async function build(
  opts: { role?: string; status?: string; totp?: boolean } = {},
) {
  const passwordHash = await hashSecret('Right-pass-2026');
  const answerHash = await hashSecret('мой ответ');
  const user = {
    id: 'u1',
    email: 'boss@x.io',
    role: 'admin',
    status: opts.status ?? 'active',
    deleted_at: null,
    admin_profile: { admin_role: opts.role ?? 'super_admin' },
  };
  const prisma = {
    adminCredential: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.login === 'boss')
          return Promise.resolve({
            user_id: 'u1',
            password_hash: passwordHash,
            security_question: 'Кого ты любил?',
            security_answer_hash: answerHash,
            totp_enabled_at: opts.totp === false ? null : new Date(),
            user,
          });
        if (where.user_id)
          return Promise.resolve({
            totp_enabled_at: opts.totp === false ? null : new Date(),
          });
        return Promise.resolve(null);
      }),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'boss@x.io',
        admin_profile: { admin_role: 'super_admin', permissions: {} },
        admin_credential: {
          totp_enabled_at: null,
          last_login_at: null,
          login: 'boss',
          password_hash: 'x',
          security_question: null,
          security_answer_hash: null,
        },
      }),
    },
  };
  const redis = { set: jest.fn().mockResolvedValue('OK') };
  const tokens = {
    signAdminTicket: jest.fn().mockReturnValue('ticket-jwt'),
    signAdminToken: jest.fn().mockReturnValue('admin-jwt'),
  };
  const sessions = {
    revokeAllForUser: jest.fn().mockResolvedValue(2),
    create: jest.fn().mockResolvedValue(undefined),
  };
  const rateLimit = {
    hashIdentifier: (s: string) => `h:${s}`,
    consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: (k: string) => (k === 'ADMIN_TOTP_ENC_KEY' ? KEY : undefined),
    getOrThrow: () => 50,
  };
  const svc = new AdminAuthService(
    prisma as never,
    redis as never,
    {} as never,
    tokens as never,
    sessions as never,
    rateLimit as never,
    audit as never,
    config as never,
  );
  return { svc, prisma, sessions, audit, rateLimit };
}

describe('AdminAuthService password sign-in', () => {
  it('right login + password signs in at once when two-factor is off (default)', async () => {
    const { svc, sessions } = await build({ totp: false });
    const res = await svc.loginPassword(' Boss ', 'Right-pass-2026', '1.1.1.1');
    expect(res.ticket).toBeNull();
    expect(res.session?.accessToken).toBe('admin-jwt');
    expect(sessions.create).toHaveBeenCalled();
  });

  it('asks for the authenticator code only when the admin turned it on', async () => {
    const { svc, sessions } = await build();
    const res = await svc.loginPassword('boss', 'Right-pass-2026', '1.1.1.1');
    expect(res.ticket).toBe('ticket-jwt');
    expect(res.session).toBeNull();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('wrong password and unknown login fail the same way', async () => {
    const { svc } = await build();
    for (const [l, p] of [
      ['boss', 'Wrong-pass-2026'],
      ['nobody', 'Right-pass-2026'],
    ]) {
      await expect(svc.loginPassword(l, p, null)).rejects.toMatchObject({
        response: { code: 'ADMIN_CREDENTIALS_INVALID' },
      });
    }
  });

  it('a disabled admin cannot sign in even with the right password', async () => {
    const { svc } = await build({ status: 'suspended' });
    await expect(
      svc.loginPassword('boss', 'Right-pass-2026', null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AdminAuthService recovery by security question', () => {
  it('shows a neutral question for an unknown login', async () => {
    const { svc } = await build();
    const q = await svc.recoverQuestion('nobody', null);
    expect(q).not.toContain('любил');
    expect(await svc.recoverQuestion('boss', null)).toBe('Кого ты любил?');
  });

  it('right answer (any case/spacing) sets the new password and ends sessions', async () => {
    const { svc, prisma, sessions, audit } = await build();
    await svc.recoverPassword(
      'boss',
      '  МОЙ   ответ ',
      'New-pass-2026-x',
      null,
    );
    expect(prisma.adminCredential.update).toHaveBeenCalled();
    const data = prisma.adminCredential.update.mock.calls[0][0].data;
    expect(data.password_hash).toMatch(/^scrypt\$/);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.password_recovered' }),
    );
  });

  it('wrong answer changes nothing', async () => {
    const { svc, prisma } = await build();
    await expect(
      svc.recoverPassword('boss', 'не знаю', 'New-pass-2026-x', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_RECOVERY_FAILED' } });
    expect(prisma.adminCredential.update).not.toHaveBeenCalled();
  });

  it('only the super admin can recover this way', async () => {
    const { svc, prisma } = await build({ role: 'support' });
    await expect(
      svc.recoverPassword('boss', 'мой ответ', 'New-pass-2026-x', null),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_RECOVERY_FAILED' } });
    expect(prisma.adminCredential.update).not.toHaveBeenCalled();
  });

  it('works without an authenticator (it is optional now)', async () => {
    const { svc, prisma } = await build({ totp: false });
    await svc.recoverPassword('boss', 'мой ответ', 'New-pass-2026-x', null);
    expect(prisma.adminCredential.update).toHaveBeenCalled();
  });

  it('refuses a weak new password after a right answer', async () => {
    const { svc, prisma } = await build();
    await expect(
      svc.recoverPassword('boss', 'мой ответ', 'short', null),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(prisma.adminCredential.update).not.toHaveBeenCalled();
  });
});

describe('AdminAuthService own security question', () => {
  it('is refused for a non-super admin', async () => {
    const { svc } = await build();
    await expect(
      svc.setSecurityQuestion(
        { id: 'u9', adminRole: 'support' } as unknown as AdminActor,
        'q?',
        'answer',
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});

describe('AdminAuthService own credentials', () => {
  it('only the super admin may change their own login and password', async () => {
    const { svc, prisma } = await build();
    await expect(
      svc.changeOwnCredentials(
        { id: 'u9', adminRole: 'support' } as unknown as AdminActor,
        { newPassword: 'Another-pass-2026' },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(prisma.adminCredential.update).not.toHaveBeenCalled();
  });
});
