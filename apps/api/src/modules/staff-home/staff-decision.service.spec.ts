import { HttpException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { StaffAdminActionsAdapter } from '../staff-appeals/staff-admin-actions.adapter';
import { StaffDecisionService } from './staff-decision.service';

const ON = { 'staff.rating_enabled': true, 'staff.suggestions_enabled': true };
const owner = {
  id: 'owner',
  adminRole: 'super_admin',
  ip: '1.1.1.1',
} as AdminActor;
const NOW = new Date('2026-10-27T10:00:00Z');

function build(
  kind: string,
  status = 'open',
  stored: Record<string, unknown> = ON,
) {
  const tx = {
    staffSuggestion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    staffMemberState: { upsert: jest.fn().mockResolvedValue({}) },
    staffAction: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    staffSuggestion: {
      findUnique: jest.fn().mockResolvedValue({
        id: 's1',
        admin_id: 'w1',
        kind,
        status,
        evidence: { rating: 50, flags: ['very_low'] },
      }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const disable = jest.fn().mockResolvedValue(undefined);
  const svc = new StaffDecisionService(
    prisma as unknown as PrismaService,
    new StaffSettingsService({
      all: () => Promise.resolve(stored),
    } as unknown as AppSettingsService),
    audit as unknown as AuditLogService,
    { disable } as unknown as StaffAdminActionsAdapter,
  );
  return { svc, tx, audit, disable, prisma };
}

describe('StaffDecisionService (the buttons under a suggestion)', () => {
  it('only the owner; switches off = not found', async () => {
    await expect(
      build('warn').svc.decide({ ...owner, adminRole: 'moderator' }, 's1', {
        action: 'apply',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      build('warn', 'open', {}).svc.decide(owner, 's1', { action: 'apply' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dismiss only marks it and writes an audit row', async () => {
    const { svc, tx, audit } = build('warn');
    const r = await svc.decide(owner, 's1', { action: 'dismiss' }, NOW);
    expect(r.status).toBe('dismissed');
    expect(tx.staffSuggestion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'dismissed',
          decided_by: 'owner',
        }),
      }),
    );
    expect(tx.staffAction.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.staff.suggestion_dismiss' }),
      tx,
    );
  });

  it('warn: journal only, no state change', async () => {
    const { svc, tx, audit } = build('warn');
    const r = await svc.decide(
      owner,
      's1',
      { action: 'apply', note: ' ok ' },
      NOW,
    );
    expect(r).toMatchObject({ status: 'applied', done: 'Записано в журнал.' });
    expect(tx.staffMemberState.upsert).not.toHaveBeenCalled();
    expect(tx.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'w1',
        actor_id: 'owner',
        source: 'owner',
        kind: 'warn',
        reason_code: 'very_low',
        reason_note: 'ok',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.staff.suggestion_apply' }),
      tx,
    );
  });

  it('pull: a week on hold, recorded with its end date', async () => {
    const { svc, tx } = build('pull');
    const r = await svc.decide(owner, 's1', { action: 'apply' }, NOW);
    expect(r.done).toContain('3 ноября');
    expect(tx.staffMemberState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          state: 'paused',
          state_until: new Date('2026-11-03T10:00:00Z'),
        }),
      }),
    );
    expect(tx.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'pull',
        ends_at: new Date('2026-11-03T10:00:00Z'),
      }),
    });
  });

  it('more_review sets the per-person rate; reward is a journal row', async () => {
    const a = build('more_review');
    await a.svc.decide(owner, 's1', { action: 'apply' }, NOW);
    expect(a.tx.staffMemberState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { review_rate_override: 30 } }),
    );
    const b = build('reward');
    await b.svc.decide(owner, 's1', { action: 'apply' }, NOW);
    expect(b.tx.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'reward',
        reason_code: 'top_rating',
      }),
    });
  });

  it('replace: journal + offboarded + the administrators disable call; a failed call is reported', async () => {
    const ok = build('replace');
    const r = await ok.svc.decide(owner, 's1', { action: 'apply' }, NOW);
    expect(ok.disable).toHaveBeenCalledWith(owner, 'w1');
    expect(r.done).toContain('доступ закрыт');
    const bad = build('replace');
    bad.disable.mockRejectedValue(new Error('last super admin'));
    const r2 = await bad.svc.decide(owner, 's1', { action: 'apply' }, NOW);
    expect(r2.status).toBe('applied');
    expect(r2.done).toContain('отключите человека');
  });

  it('an already decided suggestion is a clean 400', async () => {
    const { svc } = build('warn', 'applied');
    await expect(
      svc.decide(owner, 's1', { action: 'apply' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('a lost race (nobody left to update) is a 400, nothing is written', async () => {
    const { svc, tx } = build('warn');
    tx.staffSuggestion.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      svc.decide(owner, 's1', { action: 'apply' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(tx.staffAction.create).not.toHaveBeenCalled();
  });
});
