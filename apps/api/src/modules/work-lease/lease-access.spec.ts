import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { canWorkQueue } from './lease-access';
import { LEASE_QUEUE_KINDS, LEASE_QUEUE_SOURCES } from './lease-queue-sources';
import { WORK_LEASE_KINDS } from '../../common/staff-events';

const admin = (over: Partial<AdminActor>): AdminActor => ({
  id: 'a',
  adminRole: 'support',
  sessionId: 's',
  justification: null,
  ip: null,
  permissions: {},
  workspace: 'mass',
  ...over,
});

describe('canWorkQueue (who may press «Следующий» on which queue)', () => {
  it('uses the queue’s own area toggle', () => {
    const a = admin({ permissions: { support: 'manage' } });
    expect(canWorkQueue(a, 'support_ticket', false)).toBe(true);
    expect(canWorkQueue(a, 'verification', false)).toBe(false);
    expect(canWorkQueue(a, 'report', false)).toBe(false);
  });

  it('view-only is not enough to take work', () => {
    const a = admin({ permissions: { moderation: 'view' } });
    expect(canWorkQueue(a, 'report', false)).toBe(false);
  });

  it('the owner works every queue; an unknown kind never', () => {
    const o = admin({ adminRole: 'super_admin', workspace: 'owner' });
    for (const k of LEASE_QUEUE_KINDS)
      expect(canWorkQueue(o, k, true)).toBe(true);
    expect(canWorkQueue(o, 'refund', false)).toBe(false);
  });

  it('a finance workspace person cannot take mass queues while workspaces are on', () => {
    const f = admin({
      adminRole: 'moderator',
      workspace: 'finance',
      permissions: { moderation: 'manage' },
    });
    expect(canWorkQueue(f, 'report', false)).toBe(true);
    expect(canWorkQueue(f, 'report', true)).toBe(false);
  });
});

describe('queue sources', () => {
  it('serve only kinds the table allows, one source per kind', () => {
    const kinds = LEASE_QUEUE_SOURCES.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of kinds) expect(WORK_LEASE_KINDS).toContain(k);
  });
});
