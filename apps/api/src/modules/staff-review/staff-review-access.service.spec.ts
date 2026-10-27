import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { settingsOf } from '../staff-rating/staff-rating.test-support';
import { StaffReviewAccessService } from './staff-review-access.service';

const ON = { 'staff.rating_enabled': true, 'staff.sampling_enabled': true };
const ID = '11111111-1111-4111-8111-111111111111';

function make(
  stored: Record<string, unknown>,
  profile: Record<string, unknown> | null,
  state: Record<string, unknown> | null = null,
) {
  const prisma = {
    adminProfile: { findUnique: jest.fn(() => Promise.resolve(profile)) },
    staffMemberState: { findUnique: jest.fn(() => Promise.resolve(state)) },
  };
  const svc = new StaffReviewAccessService(
    prisma as unknown as PrismaService,
    settingsOf(stored),
  );
  return { svc, prisma };
}

const actor = (over: Record<string, unknown> = {}) =>
  ({ id: ID, adminRole: 'moderator', ...over }) as never;

describe('StaffReviewAccessService', () => {
  it('off (rating or sampling): everybody gets «not found», nothing is read', async () => {
    for (const stored of [
      {},
      { 'staff.rating_enabled': true },
      { 'staff.sampling_enabled': true },
    ]) {
      const { svc, prisma } = make(stored, null);
      await expect(
        svc.require(actor({ adminRole: 'super_admin' })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.adminProfile.findUnique).not.toHaveBeenCalled();
    }
  });

  it('the owner (super admin or owner workspace) re-checks every workspace', async () => {
    const a = await make(ON, null).svc.require(
      actor({ adminRole: 'super_admin' }),
    );
    expect(a).toEqual({ level: 'owner', workspace: null, kinds: null });
    const b = await make(ON, {
      workspace: 'owner',
      is_workspace_head: false,
      admin_role: 'support',
    }).svc.require(actor());
    expect(b.level).toBe('owner');
  });

  it('a head comes from the database, not from the guard flag', async () => {
    const a = await make(ON, {
      workspace: 'mass',
      is_workspace_head: true,
      admin_role: 'support',
    }).svc.require(actor({ workspaceHead: false }));
    expect(a).toEqual({ level: 'head', workspace: 'mass', kinds: null });
  });

  it('a deputy or a partner-team head is not a head here', async () => {
    const profile = {
      workspace: 'mass',
      is_workspace_head: true,
      admin_role: 'support',
    };
    await expect(
      make(ON, profile).svc.require(actor({ manageAdmins: true })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      make(ON, profile).svc.require(actor({ partner: { id: 'p' } })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a senior (tier 3, active) re-checks only the kinds of their own role', async () => {
    const a = await make(
      ON,
      { workspace: 'mass', is_workspace_head: false, admin_role: 'verifier' },
      { trust_tier: 3, state: 'active' },
    ).svc.require(actor());
    expect(a).toEqual({
      level: 'senior',
      workspace: 'mass',
      kinds: ['verification'],
    });
  });

  it('a plain worker, a lower tier and a paused senior get «not found»', async () => {
    const profile = {
      workspace: 'mass',
      is_workspace_head: false,
      admin_role: 'support',
    };
    for (const state of [
      null,
      { trust_tier: 2, state: 'active' },
      { trust_tier: 3, state: 'paused' },
    ]) {
      await expect(
        make(ON, profile, state).svc.require(actor()),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('golden, team and stats are for the owner and heads, not for a senior', async () => {
    const senior = make(
      ON,
      { workspace: 'mass', is_workspace_head: false, admin_role: 'support' },
      { trust_tier: 3, state: 'active' },
    ).svc;
    await expect(senior.requireHead(actor())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const head = make(ON, {
      workspace: 'finance',
      is_workspace_head: true,
      admin_role: 'finance',
    }).svc;
    await expect(head.requireHead(actor())).resolves.toMatchObject({
      level: 'head',
      workspace: 'finance',
    });
  });
});
