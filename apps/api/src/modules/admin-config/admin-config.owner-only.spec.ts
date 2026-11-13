import { ForbiddenException } from '@nestjs/common';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  AdminConfigService,
  OWNER_ONLY_CONFIG_KEYS,
} from './admin-config.service';
import { configSchema } from './config-schema';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';

/** Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам» is
 * changed by the owner only, with a fresh 2FA code. */
describe('owner-only settings (row 60)', () => {
  const actor = (adminRole: string): AdminActor =>
    ({
      id: 'a1',
      adminRole,
      sessionId: 's1',
      ip: null,
    }) as unknown as AdminActor;

  function service(stepUp: jest.Mock | null) {
    const svc = Object.create(
      AdminConfigService.prototype,
    ) as AdminConfigService;
    (svc as unknown as { adminAuth?: unknown }).adminAuth = stepUp
      ? { assertStepUp: stepUp }
      : undefined;
    return svc;
  }
  const check = (svc: AdminConfigService, a: AdminActor, key: string) =>
    (
      svc as unknown as {
        assertOwnerOnly(a: AdminActor, k: string): Promise<void>;
      }
    ).assertOwnerOnly(a, key);

  it('the switch is off by default and every key is in the admin schema', () => {
    expect(APP_SETTINGS['verification.auto_decision.enabled']).toBe(false);
    expect(
      APP_SETTINGS['verification.auto_decision.persona_document_enabled'],
    ).toBe(false);
    expect(
      APP_SETTINGS['verification.auto_decision.ai_request_info_enabled'],
    ).toBe(false);
    const schema = configSchema();
    for (const k of OWNER_ONLY_CONFIG_KEYS) expect(schema[k]).toBeDefined();
  });

  it('another admin gets 403 FORBIDDEN', async () => {
    const stepUp = jest.fn().mockResolvedValue(undefined);
    await expect(
      check(
        service(stepUp),
        actor('verifier'),
        'verification.auto_decision.enabled',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stepUp).not.toHaveBeenCalled();
  });

  it('the owner needs a fresh 2FA code', async () => {
    const stepUp = jest.fn().mockResolvedValue(undefined);
    await check(
      service(stepUp),
      actor('super_admin'),
      'verification.auto_decision.enabled',
    );
    expect(stepUp).toHaveBeenCalledWith('s1');
    // No 2FA service in this process: closed.
    await expect(
      check(
        service(null),
        actor('super_admin'),
        'verification.auto_decision.enabled',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('other keys are not affected', async () => {
    const stepUp = jest.fn();
    await check(
      service(stepUp),
      actor('verifier'),
      'verification.require_photo',
    );
    expect(stepUp).not.toHaveBeenCalled();
  });
});
