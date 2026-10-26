import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { demoContext } from '../../../common/demo/demo-context';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { CaseHistoryController } from '../../case-history/case-history.controller';
import { DataExportController } from '../../privacy/data-export.controller';
import { UsersController } from '../../users/controllers/users.controller';
import type { RequestUser } from '../decorators/current-user.decorator';
import { ReauthGuard } from '../guards/reauth.guard';
import type { AuthEventService } from './auth-event.service';
import { DemoReauthService } from './demo-reauth.service';
import { ReauthVerifier } from './reauth-verifier.service';
import { TokenService } from './token.service';

/**
 * Owner 2026-10-08: a DEMO session skips the reauth one-time code for case
 * history export, data export and account deletion; a real session keeps
 * the code step exactly as before. "Demo" is the server's demo context plus
 * the signed `demo` claim — never anything the client asserts on its own.
 */

const CONFIG: Record<string, unknown> = {
  JWT_KEYS: `kid1:${'a'.repeat(32)}`,
  JWT_ACTIVE_KID: 'kid1',
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_DAYS: 60,
  REAUTH_TOKEN_TTL_SECONDS: 300,
};
const config = {
  getOrThrow: <T>(key: string): T => {
    if (!(key in CONFIG)) throw new Error(`missing ${key}`);
    return CONFIG[key] as T;
  },
};

/** Just SET NX / EXISTS — what ReauthVerifier uses. */
function fakeRedis() {
  const keys = new Set<string>();
  return {
    set: jest.fn((key: string) => {
      if (keys.has(key)) return Promise.resolve(null);
      keys.add(key);
      return Promise.resolve('OK');
    }),
    exists: jest.fn((key: string) => Promise.resolve(keys.has(key) ? 1 : 0)),
  };
}

const tokens = new TokenService(new JwtService({}), config as never);
const DEMO_USER: RequestUser = {
  sub: 'demo-user',
  role: 'client',
  sid: 'demo-chain',
  verified: false,
  subscriptionStatus: 'none',
  demo: true,
};
const REAL_USER: RequestUser = {
  sub: 'real-user',
  role: 'client',
  sid: 'real-chain',
  verified: false,
  subscriptionStatus: 'none',
};

function setup() {
  const record = jest.fn().mockResolvedValue(undefined);
  const demoReauth = new DemoReauthService(tokens, {
    record,
  } as unknown as AuthEventService);
  const verifier = new ReauthVerifier(
    tokens,
    fakeRedis() as never,
    config as never,
    {} as never, // prisma (not used by the demo path)
  );
  return { demoReauth, verifier, record };
}

function req(user: RequestUser, reauthToken?: string): Request {
  const headers: Record<string, string> = reauthToken
    ? { 'x-reauth-token': reauthToken }
    : {};
  return {
    user,
    ip: '127.0.0.1',
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request & { user: RequestUser };
}

const inDemo = <T>(fn: () => Promise<T>): Promise<T> => demoContext.runDemo(fn);
const inReal = <T>(fn: () => Promise<T>): Promise<T> =>
  demoContext.run(false, fn);

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const body = (
      e as { getResponse?: () => { code?: string } }
    ).getResponse?.();
    return body?.code ?? String(e);
  }
  return 'resolved';
}

describe('DemoReauthService (POST /auth/reauth/demo)', () => {
  it('keeps the signed demo claim through access-token verification', () => {
    const access = tokens.signAccessToken({ ...DEMO_USER });
    expect(tokens.verifyAccessToken(access).demo).toBe(true);
    const real = tokens.signAccessToken({ ...REAL_USER });
    expect(tokens.verifyAccessToken(real)).not.toHaveProperty('demo');
  });

  it('issues a reauth token without a code in a demo session', async () => {
    const { demoReauth, verifier, record } = setup();
    const { reauthToken } = await inDemo(() => demoReauth.issue(DEMO_USER));
    expect(tokens.verifyReauthToken(reauthToken)).toMatchObject({
      sub: DEMO_USER.sub,
      sid: DEMO_USER.sid,
    });
    // An ordinary session-bound reauth token: valid for this session only.
    await expect(
      inDemo(() => verifier.assertValid(req(DEMO_USER, reauthToken))),
    ).resolves.toBeUndefined();
    expect(
      await codeOf(
        inDemo(() =>
          verifier.assertValid(
            req({ ...DEMO_USER, sid: 'other-chain' }, reauthToken),
          ),
        ),
      ),
    ).toBe(ErrorCode.REAUTH_INVALID);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DEMO_USER.sub, success: true }),
    );
  });

  it('refuses a real session: the code step stays mandatory', async () => {
    const { demoReauth, record } = setup();
    expect(await codeOf(inReal(() => demoReauth.issue(REAL_USER)))).toBe(
      ErrorCode.FORBIDDEN,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('needs BOTH the demo context and the signed demo claim', async () => {
    const { demoReauth } = setup();
    // Demo header path without a demo token (JwtAuthGuard refuses this
    // pair already; the service does not rely on that alone).
    expect(await codeOf(inDemo(() => demoReauth.issue(REAL_USER)))).toBe(
      ErrorCode.FORBIDDEN,
    );
    expect(await codeOf(inReal(() => demoReauth.issue(DEMO_USER)))).toBe(
      ErrorCode.FORBIDDEN,
    );
  });
});

describe('case history PDF export', () => {
  function controller(verifier: ReauthVerifier) {
    const exports = {
      enqueue: jest.fn().mockResolvedValue({ id: 'e1', status: 'queued' }),
      status: jest.fn().mockResolvedValue({ id: 'e1', status: 'ready' }),
    };
    const history = { visibleWhere: jest.fn() };
    const c = new CaseHistoryController(
      history as never,
      exports as never,
      verifier,
    );
    return { c, exports };
  }

  it('demo: the code-less token queues and downloads the export', async () => {
    const { demoReauth, verifier } = setup();
    const { c, exports } = controller(verifier);
    const { reauthToken } = await inDemo(() => demoReauth.issue(DEMO_USER));
    await inDemo(() =>
      c.exportCaseHistory(DEMO_USER, req(DEMO_USER, reauthToken)),
    );
    expect(exports.enqueue).toHaveBeenCalledWith(DEMO_USER);
    await inDemo(() =>
      c.getCaseHistoryExport(
        DEMO_USER,
        { exportId: 'e1' },
        req(DEMO_USER, reauthToken),
      ),
    );
    // Still single-use: the download consumed it.
    expect(
      await codeOf(
        inDemo(() =>
          c.exportCaseHistory(DEMO_USER, req(DEMO_USER, reauthToken)),
        ),
      ),
    ).toBe(ErrorCode.REAUTH_INVALID);
  });

  it('real: no code-less token, no export without the reauth header', async () => {
    const { demoReauth, verifier } = setup();
    const { c, exports } = controller(verifier);
    expect(await codeOf(inReal(() => demoReauth.issue(REAL_USER)))).toBe(
      ErrorCode.FORBIDDEN,
    );
    expect(
      await codeOf(
        inReal(() => c.exportCaseHistory(REAL_USER, req(REAL_USER))),
      ),
    ).toBe(ErrorCode.REAUTH_REQUIRED);
    expect(exports.enqueue).not.toHaveBeenCalled();
  });
});

describe('personal data export', () => {
  function controller(verifier: ReauthVerifier) {
    const exports = {
      request: jest.fn().mockResolvedValue({ id: 'd1', status: 'queued' }),
    };
    return { c: new DataExportController(exports as never, verifier), exports };
  }

  it('demo: the code-less token queues the ZIP', async () => {
    const { demoReauth, verifier } = setup();
    const { c, exports } = controller(verifier);
    const { reauthToken } = await inDemo(() => demoReauth.issue(DEMO_USER));
    await inDemo(() =>
      c.requestDataExport(DEMO_USER, req(DEMO_USER, reauthToken)),
    );
    expect(exports.request).toHaveBeenCalledWith(DEMO_USER);
  });

  it('real: refused without the reauth header, no code-less token', async () => {
    const { demoReauth, verifier } = setup();
    const { c, exports } = controller(verifier);
    expect(await codeOf(inReal(() => demoReauth.issue(REAL_USER)))).toBe(
      ErrorCode.FORBIDDEN,
    );
    expect(
      await codeOf(
        inReal(() => c.requestDataExport(REAL_USER, req(REAL_USER))),
      ),
    ).toBe(ErrorCode.REAUTH_REQUIRED);
    expect(exports.request).not.toHaveBeenCalled();
  });
});

describe('account deletion (DELETE /users/me, ReauthGuard)', () => {
  // The real route's metadata (@ReauthRequired on deleteAccount).
  const deleteHandler = Object.getOwnPropertyDescriptor(
    UsersController.prototype,
    'deleteAccount',
  )?.value as () => unknown;
  function guardContext(request: Request): ExecutionContext {
    return {
      getHandler: () => deleteHandler,
      getClass: () => UsersController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('demo: the code-less token passes the guard once', async () => {
    const { demoReauth, verifier } = setup();
    const guard = new ReauthGuard(new Reflector(), verifier);
    const { reauthToken } = await inDemo(() => demoReauth.issue(DEMO_USER));
    await expect(
      inDemo(() =>
        guard.canActivate(guardContext(req(DEMO_USER, reauthToken))),
      ),
    ).resolves.toBe(true);
    expect(
      await codeOf(
        inDemo(() =>
          guard.canActivate(guardContext(req(DEMO_USER, reauthToken))),
        ),
      ),
    ).toBe(ErrorCode.REAUTH_INVALID);
  });

  it('real: still requires a reauth token from the code step', async () => {
    const { demoReauth, verifier } = setup();
    const guard = new ReauthGuard(new Reflector(), verifier);
    expect(await codeOf(inReal(() => demoReauth.issue(REAL_USER)))).toBe(
      ErrorCode.FORBIDDEN,
    );
    expect(
      await codeOf(
        inReal(() => guard.canActivate(guardContext(req(REAL_USER)))),
      ),
    ).toBe(ErrorCode.REAUTH_REQUIRED);
    // The code step's token (POST /auth/reauth) still works unchanged.
    const fromCode = tokens.signReauthToken({
      sub: REAL_USER.sub,
      sid: REAL_USER.sid,
    });
    await expect(
      inReal(() => guard.canActivate(guardContext(req(REAL_USER, fromCode)))),
    ).resolves.toBe(true);
  });
});
