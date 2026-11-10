import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  AssistantAllowed,
  AttorneyOnly,
  RequiresDuty,
} from '../assistant/assistant-context';
import { OptionalAuth } from '../decorators/optional-auth.decorator';

/**
 * Security audit 2026-11-08 (L2): for an assistant working inside the
 * attorney's account the guard is deny-by-default. Before, a route with no
 * marker served the attorney's data to a duty-less assistant (bid detail,
 * case comments, invites, saved items, files…).
 */
class Routes {
  undecorated() {}
  @AssistantAllowed()
  allowed() {}
  @RequiresDuty('cases', 'bids', 'bid_drafts')
  bidRead() {}
  @RequiresDuty('cases')
  caseWork() {}
  @AttorneyOnly('publish')
  publish() {}
  @AttorneyOnly()
  billing() {}
  @OptionalAuth()
  publicRead() {}
}

const ATTORNEY = 'attorney-1';

function guardFor(role: 'assistant' | 'attorney', duties: string[]) {
  const tokens = {
    verifyAccessToken: () => ({
      sub: role === 'assistant' ? 'assistant-1' : ATTORNEY,
      sid: 'sid-1',
      role,
    }),
  };
  const revocation = { blacklistReason: () => Promise.resolve(null) };
  const assistants = {
    resolve: () =>
      Promise.resolve({
        attorneyId: ATTORNEY,
        membershipId: 'm-1',
        name: 'Helper',
        duties,
      }),
  };
  return new JwtAuthGuard(
    new Reflector(),
    tokens as never,
    revocation as never,
    assistants as never,
  );
}

function ctx(name: keyof Routes) {
  const req: { user?: { sub: string }; header: (h: string) => string } = {
    header: (h: string) => (h === 'authorization' ? 'Bearer t' : ''),
  };
  const context = {
    getType: () => 'http',
    getHandler: (): unknown => Reflect.get(Routes.prototype, name),
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

async function run(
  role: 'assistant' | 'attorney',
  duties: string[],
  name: keyof Routes,
) {
  const { context, req } = ctx(name);
  const ok = await guardFor(role, duties).canActivate(context);
  return { ok, sub: req.user?.sub };
}

describe('JwtAuthGuard: assistant deny-by-default (audit 2026-11-08 L2)', () => {
  it('a route with no marker is closed to an assistant', async () => {
    await expect(run('assistant', [], 'undecorated')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Even with every duty: an unmarked route is not part of the work.
    await expect(
      run('assistant', ['cases', 'chats', 'bids'], 'undecorated'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the attorney and every other role are not affected', async () => {
    await expect(run('attorney', [], 'undecorated')).resolves.toEqual({
      ok: true,
      sub: ATTORNEY,
    });
  });

  it('@AssistantAllowed and public reads open as the attorney', async () => {
    await expect(run('assistant', [], 'allowed')).resolves.toEqual({
      ok: true,
      sub: ATTORNEY,
    });
    await expect(run('assistant', [], 'publicRead')).resolves.toEqual({
      ok: true,
      sub: ATTORNEY,
    });
  });

  it('several duties mean any one of them', async () => {
    await expect(run('assistant', ['bid_drafts'], 'bidRead')).resolves.toEqual({
      ok: true,
      sub: ATTORNEY,
    });
    await expect(run('assistant', ['calls'], 'bidRead')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run('assistant', [], 'caseWork')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('attorney-only stays closed unless that right was delegated', async () => {
    await expect(run('assistant', ['publish'], 'publish')).resolves.toEqual({
      ok: true,
      sub: ATTORNEY,
    });
    await expect(run('assistant', [], 'publish')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      run('assistant', ['cases', 'publish'], 'billing'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
