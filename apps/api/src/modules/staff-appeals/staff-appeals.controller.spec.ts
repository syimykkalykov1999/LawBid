import { ForbiddenException } from '@nestjs/common';
import { ADMIN_ROLES_KEY } from '../admin-auth/admin-auth.decorators';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { routeArea } from '../admin-auth/admin-permissions';
import { canAccess } from '../admin-auth/admin-permissions';
import {
  StaffAppealsAuthorController,
  StaffAppealsController,
} from './staff-appeals.controller';

const owner = {
  id: 'o',
  adminRole: 'super_admin',
  sessionId: 's1',
} as AdminActor;
const ID = '11111111-1111-1111-1111-111111111111';

function build(stepUp: 'ok' | 'missing') {
  const appeals = new Proxy({} as Record<string, jest.Mock>, {
    get: (t, k: string) => (t[k] ??= jest.fn().mockResolvedValue({})),
  });
  const auth = {
    assertStepUp: jest.fn(() =>
      stepUp === 'ok'
        ? Promise.resolve()
        : Promise.reject(new ForbiddenException('step-up')),
    ),
  };
  return {
    appeals,
    auth,
    ctrl: new StaffAppealsController(appeals as never, auth as never),
  };
}

describe('StaffAppealsController (owner inbox)', () => {
  it('is a super_admin-only controller', () => {
    expect(
      Reflect.getMetadata(ADMIN_ROLES_KEY, StaffAppealsController),
    ).toEqual(['super_admin']);
  });

  it('the guard closes the whole path for every non-owner role (unknown area → 404)', () => {
    expect(routeArea('/api/v1/admin/appeals')).toBe('unknown');
    for (const role of [
      'moderator',
      'verifier',
      'support',
      'finance',
    ] as const) {
      for (const method of ['GET', 'POST', 'DELETE', 'PATCH']) {
        expect(
          canAccess(
            role,
            { support: 'manage', users: 'manage' },
            '/api/v1/admin/appeals/x',
            method,
          ),
        ).toBe(false);
      }
    }
  });

  it('the author route sits in the area every admin reaches', () => {
    expect(routeArea('/api/v1/admin/workspace/appeals')).toBe('workspace');
    expect(
      canAccess('support', {}, '/api/v1/admin/workspace/appeals', 'POST'),
    ).toBe(true);
  });

  it.each([
    [
      'decide',
      (c: StaffAppealsController) =>
        c.decideAppeal(owner, ID, { decision: 'nothing' }),
    ],
    ['reveal', (c: StaffAppealsController) => c.revealAuthor(owner, ID)],
    ['reverse', (c: StaffAppealsController) => c.reverseFlag(owner, ID, {})],
    ['uphold', (c: StaffAppealsController) => c.upholdFlag(owner, ID, {})],
  ])('%s needs a fresh 2FA code before anything happens', async (name, run) => {
    const missing = build('missing');
    await expect(run(missing.ctrl)).rejects.toBeInstanceOf(ForbiddenException);
    expect(missing.auth.assertStepUp).toHaveBeenCalledWith('s1');
    expect(Object.keys(missing.appeals)).toEqual([]);
    const ok = build('ok');
    await run(ok.ctrl);
    expect(ok.appeals[name]).toHaveBeenCalledTimes(1);
  });

  it('reading needs no step-up', async () => {
    const { ctrl, auth, appeals } = build('missing');
    await ctrl.listAppeals(owner, {});
    await ctrl.getAppeal(owner, ID);
    await ctrl.listFlags(owner, {});
    await ctrl.listSignals(owner);
    expect(auth.assertStepUp).not.toHaveBeenCalled();
    expect(appeals.list).toHaveBeenCalled();
  });

  it('has no delete route', () => {
    const methods = Object.getOwnPropertyNames(
      StaffAppealsController.prototype,
    );
    expect(methods.filter((m) => /delete|remove/i.test(m))).toEqual([]);
    expect(
      Object.getOwnPropertyNames(StaffAppealsAuthorController.prototype).filter(
        (m) => /delete|remove/i.test(m),
      ),
    ).toEqual([]);
  });
});
