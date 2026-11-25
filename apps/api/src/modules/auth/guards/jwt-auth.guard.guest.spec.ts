import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Round 4 admin check (25.11, С9): browsing without an account had two master
 * switches. The admin's flag `guest_browsing` hid the app's screens, but the
 * API only listened to `guest.browsing_enabled` and stayed open to guests.
 * Now a token-less read passes only while both are on.
 */
describe('JwtAuthGuard: guest reads follow both guest switches', () => {
  function run(setting: boolean, flag: boolean | null) {
    const reflector = {
      getAllAndOverride: (key: string) => key === IS_OPTIONAL_AUTH_KEY,
    } as unknown as Reflector;
    const req: Record<string, unknown> = {
      headers: {},
      header: () => undefined,
      ip: '203.0.113.7',
    };
    const ctx = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const settings = { boolean: jest.fn().mockResolvedValue(setting) };
    const flags =
      flag === null
        ? undefined
        : { isEnabled: jest.fn().mockResolvedValue(flag) };
    const guard = new JwtAuthGuard(
      reflector,
      {} as never,
      {} as never,
      {} as never,
      settings as never,
      undefined,
      flags as never,
    );
    return { result: guard.canActivate(ctx), req };
  }

  it('both on: the guest is let in', async () => {
    const { result, req } = run(true, true);
    await expect(result).resolves.toBe(true);
    expect(req.user).toBeDefined();
  });

  it('the flag off: 401, the API closes with the screens', async () => {
    await expect(run(true, false).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('the setting off: 401 as before', async () => {
    await expect(run(false, true).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
