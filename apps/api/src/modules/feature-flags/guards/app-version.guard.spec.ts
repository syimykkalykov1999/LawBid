import { HttpException } from '@nestjs/common';
import { AppVersionGuard } from './app-version.guard';
import type { AppConfigService } from '../services/app-config.service';

function buildContext(
  headers: Record<string, string | undefined>,
  skip = false,
) {
  const req = { header: (name: string) => headers[name.toLowerCase()] };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
    __skip: skip,
  } as unknown as import('@nestjs/common').ExecutionContext;
}

function buildReflector(skip: boolean) {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(skip),
  } as unknown as import('@nestjs/core').Reflector;
}

describe('AppVersionGuard', () => {
  it('allows the request through when @SkipVersionCheck() is set, without reading app_config', async () => {
    const getMinAppVersion = jest.fn();
    const appConfig = { getMinAppVersion } as unknown as AppConfigService;
    const guard = new AppVersionGuard(buildReflector(true), appConfig);

    await expect(
      guard.canActivate(
        buildContext({ 'x-app-version': '0.0.1', 'x-platform': 'ios' }),
      ),
    ).resolves.toBe(true);
    expect(getMinAppVersion).not.toHaveBeenCalled();
  });

  it('allows the request through when X-App-Version is missing', async () => {
    const getMinAppVersion = jest.fn();
    const appConfig = { getMinAppVersion } as unknown as AppConfigService;
    const guard = new AppVersionGuard(buildReflector(false), appConfig);

    await expect(
      guard.canActivate(buildContext({ 'x-platform': 'ios' })),
    ).resolves.toBe(true);
    expect(getMinAppVersion).not.toHaveBeenCalled();
  });

  it('allows the request through when X-Platform is missing or unrecognized', async () => {
    const getMinAppVersion = jest.fn();
    const appConfig = { getMinAppVersion } as unknown as AppConfigService;
    const guard = new AppVersionGuard(buildReflector(false), appConfig);

    await expect(
      guard.canActivate(buildContext({ 'x-app-version': '0.0.1' })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildContext({ 'x-app-version': '0.0.1', 'x-platform': 'web' }),
      ),
    ).resolves.toBe(true);
    expect(getMinAppVersion).not.toHaveBeenCalled();
  });

  it('allows the request through when app_config has no min version set for the platform', async () => {
    const appConfig = {
      getMinAppVersion: jest.fn().mockResolvedValue(undefined),
    } as unknown as AppConfigService;
    const guard = new AppVersionGuard(buildReflector(false), appConfig);

    await expect(
      guard.canActivate(
        buildContext({ 'x-app-version': '0.0.1', 'x-platform': 'ios' }),
      ),
    ).resolves.toBe(true);
  });

  it('allows a client at or above the minimum version', async () => {
    const appConfig = {
      getMinAppVersion: jest.fn().mockResolvedValue('0.1.0'),
    } as unknown as AppConfigService;
    const guard = new AppVersionGuard(buildReflector(false), appConfig);

    await expect(
      guard.canActivate(
        buildContext({ 'x-app-version': '0.1.0', 'x-platform': 'ios' }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildContext({ 'x-app-version': '0.2.0', 'x-platform': 'ios' }),
      ),
    ).resolves.toBe(true);
  });

  it('throws a 426 APP_UPDATE_REQUIRED HttpException for a client below the minimum version', async () => {
    const appConfig = {
      getMinAppVersion: jest.fn().mockResolvedValue('1.0.0'),
    } as unknown as AppConfigService;
    const guard = new AppVersionGuard(buildReflector(false), appConfig);

    const promise = guard.canActivate(
      buildContext({ 'x-app-version': '0.1.0', 'x-platform': 'ios' }),
    );
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await guard.canActivate(
        buildContext({ 'x-app-version': '0.1.0', 'x-platform': 'ios' }),
      );
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(426);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: 'APP_UPDATE_REQUIRED',
      });
    }
  });
});
