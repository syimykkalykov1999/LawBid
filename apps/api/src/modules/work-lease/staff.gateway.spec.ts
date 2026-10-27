/* eslint-disable @typescript-eslint/unbound-method -- jest mocks are asserted on the Socket-typed object */
import type { Socket } from 'socket.io';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminSessionService } from '../admin-auth/admin-session.service';
import type { TokenService } from '../auth/services/token.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { LeaseService } from './lease.service';
import type { StaffEventsPublisher } from './staff-events.publisher';
import type { StaffPresenceService } from './staff-presence.service';
import { STAFF_NAMESPACE, StaffGateway } from './staff.gateway';

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

function makeSocket(token?: string) {
  const handlers: Record<string, unknown> = {};
  const socket = {
    id: `s-${Math.random()}`,
    data: {} as Record<string, unknown>,
    handshake: { auth: token ? { token } : {}, headers: {} },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(() => Promise.resolve()),
    handlers,
  };
  return socket as typeof socket & Socket;
}

function build(stored: Record<string, unknown>) {
  const presence = {
    heartbeat: jest.fn(() => Promise.resolve('online')),
    read: jest.fn(() => Promise.resolve({ seenMs: null, signalling: false })),
  };
  const leases = { releaseAllFor: jest.fn(() => Promise.resolve(1)) };
  const events = { toAdmin: jest.fn(), tile: jest.fn() };
  const sessions = { ownerOf: jest.fn(() => Promise.resolve('admin-1')) };
  const tokens = {
    verifyAdminToken: jest.fn((t: string) => {
      if (t !== 'good') throw new Error('bad');
      return { sub: 'admin-1', jti: 'jti-1', role: 'support' };
    }),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          role: 'admin',
          status: 'active',
          deleted_at: null,
          admin_profile: {
            admin_role: 'support',
            workspace: 'mass',
            is_workspace_head: false,
          },
        }),
      ),
    },
  };
  const gw = new StaffGateway(
    tokens as unknown as TokenService,
    sessions as unknown as AdminSessionService,
    prisma as unknown as PrismaService,
    settings(stored),
    presence as unknown as StaffPresenceService,
    leases as unknown as LeaseService,
    events as unknown as StaffEventsPublisher,
  );
  return { gw, presence, leases, events, sessions, prisma };
}

describe('StaffGateway `/staff` (staff package T3)', () => {
  it('is its own namespace', () => {
    expect(STAFF_NAMESPACE).toBe('/staff');
  });

  it('switches off (the default): every connection is closed with NOT_ENABLED, nothing is read', async () => {
    const { gw, prisma } = build({});
    const socket = makeSocket('good');
    await gw.handleConnection(socket);
    expect(socket.emit).toHaveBeenCalledWith('staff:error', {
      code: 'NOT_ENABLED',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('on, but without a valid admin token: UNAUTHORIZED', async () => {
    const { gw } = build({ 'staff.presence_enabled': true });
    const socket = makeSocket('nope');
    await gw.handleConnection(socket);
    expect(socket.emit).toHaveBeenCalledWith('staff:error', {
      code: 'UNAUTHORIZED',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('on: a valid admin joins its room and a heartbeat updates presence (status pushed once)', async () => {
    const { gw, presence, events } = build({ 'staff.presence_enabled': true });
    const socket = makeSocket('good');
    await gw.handleConnection(socket);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('admin:admin-1');
    const ack = await gw.onHeartbeat(socket, { active: true });
    expect(ack).toEqual({ ok: true, status: 'online' });
    expect(presence.heartbeat).toHaveBeenCalledWith(
      'admin-1',
      true,
      expect.any(Number),
    );
    expect(events.toAdmin).toHaveBeenCalledWith('admin-1', 'status:changed', {
      status: 'online',
    });
  });

  it('a heartbeat faster than 5 s is answered without touching Redis', async () => {
    const { gw, presence } = build({ 'staff.presence_enabled': true });
    const socket = makeSocket('good');
    await gw.handleConnection(socket);
    await gw.onHeartbeat(socket, { active: false });
    await gw.onHeartbeat(socket, { active: false });
    expect(presence.heartbeat).toHaveBeenCalledTimes(1);
  });

  it('a heartbeat with presence off is refused, not stored', async () => {
    const { gw, presence } = build({ 'staff.lease_enabled': true });
    const socket = makeSocket('good');
    await gw.handleConnection(socket);
    await expect(gw.onHeartbeat(socket, { active: true })).resolves.toEqual({
      ok: false,
      code: 'NOT_ENABLED',
    });
    expect(presence.heartbeat).not.toHaveBeenCalled();
  });

  it('an ended session closes the socket with session:revoked', async () => {
    const { gw, sessions } = build({ 'staff.presence_enabled': true });
    const socket = makeSocket('good');
    await gw.handleConnection(socket);
    sessions.ownerOf.mockResolvedValueOnce(null as never);
    await gw.onHeartbeat(socket, { active: true });
    expect(socket.emit).toHaveBeenCalledWith('session:revoked', {});
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  describe('closed tab: 60 s grace, then the leases go back', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const on = {
      'staff.presence_enabled': true,
      'staff.lease_enabled': true,
    };

    it('nobody signals for 60 s: the person’s leases are released', async () => {
      const { gw, leases } = build(on);
      const socket = makeSocket('good');
      await gw.handleConnection(socket);
      gw.handleDisconnect(socket);
      await jest.advanceTimersByTimeAsync(59_000);
      expect(leases.releaseAllFor).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(2_000);
      expect(leases.releaseAllFor).toHaveBeenCalledWith(
        'admin-1',
        'disconnected',
      );
      gw.onModuleDestroy();
    });

    it('back within the grace (a new socket): nothing is lost', async () => {
      const { gw, leases } = build(on);
      const first = makeSocket('good');
      await gw.handleConnection(first);
      gw.handleDisconnect(first);
      await jest.advanceTimersByTimeAsync(30_000);
      const second = makeSocket('good');
      await gw.handleConnection(second);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(leases.releaseAllFor).not.toHaveBeenCalled();
      gw.onModuleDestroy();
    });

    it('another tab/instance heartbeats meanwhile: nothing is lost', async () => {
      const { gw, leases, presence } = build(on);
      const socket = makeSocket('good');
      await gw.handleConnection(socket);
      gw.handleDisconnect(socket);
      presence.read.mockResolvedValue({
        seenMs: Date.now() + 50_000,
        signalling: true,
      } as never);
      await jest.advanceTimersByTimeAsync(61_000);
      expect(leases.releaseAllFor).not.toHaveBeenCalled();
      gw.onModuleDestroy();
    });

    it('one of two tabs closing starts no grace', async () => {
      const { gw, leases } = build(on);
      const a = makeSocket('good');
      const b = makeSocket('good');
      await gw.handleConnection(a);
      await gw.handleConnection(b);
      gw.handleDisconnect(a);
      await jest.advanceTimersByTimeAsync(120_000);
      expect(leases.releaseAllFor).not.toHaveBeenCalled();
      gw.onModuleDestroy();
    });
  });
});
