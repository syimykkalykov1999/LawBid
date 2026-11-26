import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { lastValueFrom, of } from 'rxjs';
import { CorsPolicy } from '../../common/cors/cors-policy';
import { AuthController } from './auth.controller';
import {
  ClearsWebSessionCookie,
  LEGACY_WEB_SESSION_COOKIE,
  WEB_SESSION_COOKIE,
  WebSessionCookieInterceptor,
  WebSessionCookies,
  isDemoAccessToken,
  readCookie,
} from './web-session-cookie';

/** Owner 2026-10-22 (audit #7): the website's refresh token in a cookie. */

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const access = (claims: object = {}) => `h.${b64({ sub: 'u1', ...claims })}.s`;

const config = (env = 'production') =>
  ({
    get: (k: string, d?: unknown) => (k === 'NODE_ENV' ? env : d),
  }) as unknown as ConfigService;

function cookies(env = 'production'): WebSessionCookies {
  const cors = new CorsPolicy(['https://admin.lawbid.dev'], 'production', () =>
    Promise.resolve(['https://lawbid.dev']),
  );
  return new WebSessionCookies(config(env), undefined, cors);
}

function req(headers: Record<string, string>, secure = false): Request {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    headers: lower,
    secure,
    header: (n: string) => lower[n.toLowerCase()],
  } as unknown as Request;
}

type CookieCall = {
  name: string;
  value: string;
  opts: Record<string, unknown>;
};

function res() {
  const calls: CookieCall[] = [];
  return {
    calls,
    cookie: (name: string, value: string, opts: Record<string, unknown>) =>
      calls.push({ name, value, opts }),
  };
}

const WEB = { origin: 'https://lawbid.dev', 'x-lawbid-web-session': '1' };

class Handlers {
  login(): void {}
  @ClearsWebSessionCookie()
  logout(): void {}
}

async function run(
  headers: Record<string, string>,
  body: unknown,
  handler: 'login' | 'logout' = 'login',
): Promise<{ out: unknown; cookies: CookieCall[] }> {
  const r = res();
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req(headers),
      getResponse: () => r,
    }),
    // eslint-disable-next-line @typescript-eslint/unbound-method -- only its metadata is read
    getHandler: () => Handlers.prototype[handler],
  } as never;
  const out = await lastValueFrom(
    new WebSessionCookieInterceptor(cookies(), new Reflector()).intercept(ctx, {
      handle: () => of(body),
    }),
  );
  return { out, cookies: r.calls };
}

describe('web session cookie', () => {
  it('reads one cookie from a raw Cookie header', () => {
    expect(readCookie('a=1; lb_rt=tok%2Bx; b=2', 'lb_rt')).toBe('tok+x');
    expect(readCookie('a=1', 'lb_rt')).toBeNull();
    expect(readCookie(undefined, 'lb_rt')).toBeNull();
  });

  it('spots a demo access token', () => {
    expect(isDemoAccessToken(access({ demo: true }))).toBe(true);
    expect(isDemoAccessToken(access())).toBe(false);
    expect(isDemoAccessToken('garbage')).toBe(false);
  });

  it('moves the refresh token into an HttpOnly cookie and blanks the body', async () => {
    const { out, cookies: set } = await run(WEB, {
      accessToken: access(),
      refreshToken: 'rt-1',
      accessTokenExpiresIn: 900,
      isNewUser: false,
    });
    expect(out).toMatchObject({ refreshToken: '', accessTokenExpiresIn: 900 });
    expect(set).toEqual([
      {
        name: WEB_SESSION_COOKIE,
        value: 'rt-1',
        opts: {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          path: '/api/v1/auth',
        },
      },
    ]);
  });

  it('leaves a demo session, a missing header and a foreign origin alone', async () => {
    const demo = { accessToken: access({ demo: true }), refreshToken: 'rt' };
    expect((await run(WEB, demo)).cookies).toHaveLength(0);
    const real = { accessToken: access(), refreshToken: 'rt' };
    for (const headers of [
      { origin: 'https://lawbid.dev' },
      { ...WEB, origin: 'https://evil.example' },
      { ...WEB, origin: 'https://admin.lawbid.dev' },
      { ...WEB, 'x-lawbid-demo': '1' },
    ]) {
      const r = await run(headers, real);
      expect(r.cookies).toHaveLength(0);
      expect(r.out).toEqual(real);
    }
  });

  it('logout clears the prefixed and the legacy cookie', async () => {
    const r = await run(WEB, { loggedOut: true }, 'logout');
    expect(r.cookies.map((c) => c.name)).toEqual([
      WEB_SESSION_COOKIE,
      LEGACY_WEB_SESSION_COOKIE,
    ]);
    for (const c of r.cookies) {
      expect(c).toMatchObject({
        value: '',
        opts: { maxAge: 0, path: '/api/v1/auth', secure: true },
      });
    }
  });

  describe('ASVS V3.3.1: __Secure- prefix (STAGE2_SECURITY #1)', () => {
    it('the cookie is named __Secure-lb_rt on https', () => {
      expect(WEB_SESSION_COOKIE).toBe('__Secure-lb_rt');
      const r = res();
      cookies().set(req(WEB), r as unknown as Response, 'x');
      expect(r.calls).toEqual([
        expect.objectContaining({
          name: '__Secure-lb_rt',
          opts: expect.objectContaining({ secure: true }) as unknown,
        }),
      ]);
    });

    it('an open session under the old name still refreshes', async () => {
      const c = cookies();
      expect(
        await c.fromRequest(req({ ...WEB, cookie: 'lb_rt=old-session' })),
      ).toBe('old-session');
      expect(
        await c.fromRequest(
          req({ ...WEB, cookie: 'lb_rt=old; __Secure-lb_rt=new' }),
        ),
      ).toBe('new');
    });

    it('the next rotation moves it to the new name and drops the old one', async () => {
      const r = await run(
        { ...WEB, cookie: 'lb_rt=old-session' },
        { accessToken: access(), refreshToken: 'rotated' },
      );
      expect(r.cookies).toEqual([
        expect.objectContaining({ name: '__Secure-lb_rt', value: 'rotated' }),
        expect.objectContaining({
          name: 'lb_rt',
          value: '',
          opts: expect.objectContaining({ maxAge: 0 }) as unknown,
        }),
      ]);
    });

    it('plain-http local development keeps the bare name', () => {
      const r = res();
      cookies('development').set(req(WEB), r as unknown as Response, 'x');
      expect(r.calls.map((c) => c.name)).toEqual(['lb_rt']);
    });
  });

  it('only a web-session request may read the cookie', async () => {
    const c = cookies();
    const cookie = `${WEB_SESSION_COOKIE}=rt-9`;
    expect(await c.fromRequest(req({ ...WEB, cookie }))).toBe('rt-9');
    expect(
      await c.fromRequest(
        req({ ...WEB, origin: 'https://evil.example', cookie }),
      ),
    ).toBeNull();
    expect(
      await c.fromRequest(req({ origin: 'https://lawbid.dev', cookie })),
    ).toBeNull();
  });

  it('not Secure on plain-http local development', () => {
    const r = res();
    cookies('development').set(req(WEB), r as unknown as Response, 'x');
    expect(r.calls[0].opts.secure).toBe(false);
  });

  describe('POST /auth/refresh', () => {
    const tokens = { accessToken: access(), refreshToken: 'next' };
    const make = () => {
      const auth = { refresh: jest.fn().mockResolvedValue(tokens) };
      const controller = new AuthController(
        auth as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        cookies(),
        {} as never,
        {} as never, // DemoReauthService (#405)
        {} as never, // PasswordReauthService (owner 2026-10-28)
        {} as never, // SocialNonceService (R2B-9)
      );
      return { auth, controller };
    };

    it('takes the token from the cookie when the body has none', async () => {
      const { auth, controller } = make();
      await controller.refresh(
        { refreshToken: '' },
        req({ ...WEB, cookie: `${WEB_SESSION_COOKIE}=from-cookie` }),
      );
      expect(auth.refresh).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: 'from-cookie' }),
        expect.anything(),
      );
    });

    it('401 without a cookie, or from a foreign origin', async () => {
      const { auth, controller } = make();
      await expect(
        controller.refresh({ refreshToken: '' }, req(WEB)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        controller.refresh(
          { refreshToken: '' },
          req({
            ...WEB,
            origin: 'https://evil.example',
            cookie: `${WEB_SESSION_COOKIE}=x`,
          }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('a token in the body still works (phones, older web tabs)', async () => {
      const { auth, controller } = make();
      await controller.refresh({ refreshToken: 'body' }, req({}));
      expect(auth.refresh).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: 'body' }),
        expect.anything(),
      );
    });
  });
});
