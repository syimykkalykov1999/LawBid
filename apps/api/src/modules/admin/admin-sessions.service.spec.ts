import { NotFoundException } from '@nestjs/common';
import { AdminSessionsService } from './admin-sessions.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';

const actor = {
  id: 'super-1',
  sessionId: 'sess-me',
  adminRole: 'super_admin',
  ip: '1.1.1.1',
} as unknown as AdminActor;

function build(owner: string | null = 'u2') {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'u2',
          email: 'a@x.io',
          admin_profile: { admin_role: 'support' },
          admin_credential: { login: 'ann' },
        },
        {
          id: 'super-1',
          email: 's@x.io',
          admin_profile: { admin_role: 'super_admin' },
          admin_credential: { login: 'boss' },
        },
      ]),
    },
  };
  const sessions = {
    listForUsers: jest.fn().mockResolvedValue([
      {
        sessionId: 'sess-a',
        userId: 'u2',
        ip: '2.2.2.2',
        device: 'Chrome · macOS',
        createdAt: '2026-10-02T01:00:00.000Z',
        lastSeenAt: '2026-10-02T02:00:00.000Z',
        lastAction: 'GET /admin/users',
      },
      {
        sessionId: 'sess-me',
        userId: 'super-1',
        ip: null,
        device: null,
        createdAt: '2026-10-02T03:00:00.000Z',
        lastSeenAt: '2026-10-02T04:00:00.000Z',
        lastAction: null,
      },
    ]),
    ownerOf: jest.fn().mockResolvedValue(owner),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new AdminSessionsService(
    prisma as never,
    sessions as never,
    audit as never,
  );
  return { svc, sessions, audit };
}

describe('AdminSessionsService', () => {
  it('lists live sessions newest first and marks the current one', async () => {
    const { svc } = build();
    const rows = await svc.list(actor);
    expect(rows.map((r) => r.sessionId)).toEqual(['sess-me', 'sess-a']);
    expect(rows[0].current).toBe(true);
    expect(rows[1]).toMatchObject({ login: 'ann', role: 'support' });
  });

  it('revokes one session and audits it', async () => {
    const { svc, sessions, audit } = build();
    await svc.revoke(actor, 'sess-a');
    expect(sessions.revoke).toHaveBeenCalledWith('sess-a', 'u2');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin_sessions.revoke',
        targetId: 'u2',
      }),
    );
  });

  it('404s on an unknown or ended session', async () => {
    const { svc, sessions } = build(null);
    await expect(svc.revoke(actor, 'gone')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
