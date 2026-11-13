import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ADMIN_ROLES_KEY } from '../admin-auth/admin-auth.decorators';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import type { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AiWorkerController, ownerOnly } from './ai-worker.controller';
import type { AiWorkerService } from './ai-worker.service';

/**
 * Owner 2026-11-12: «ИИ-сотрудник» is the OWNER's alone: no route in the
 * app or web, every route under /admin, super admin only, a fresh 2FA code
 * for changes; the AI reads only, never writes the queue, never touches
 * secrets, money, raw SQL or code.
 */
describe('AI worker: owner only', () => {
  it('the controller is under admin/ and allows only super_admin, behind AdminAuthGuard', () => {
    expect(Reflect.getMetadata('path', AiWorkerController)).toBe(
      'admin/ai-worker',
    );
    expect(new Reflector().get(ADMIN_ROLES_KEY, AiWorkerController)).toEqual([
      'super_admin',
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AiWorkerController)).toContain(
      AdminAuthGuard,
    );
  });

  it.each(['moderator', 'verifier', 'support', 'finance'] as const)(
    '%s (even the trusted deputy) gets 403 on every route',
    async (role) => {
      const worker = new Proxy(
        {},
        { get: () => jest.fn() },
      ) as unknown as AiWorkerService;
      const assertStepUp = jest.fn();
      const auth = { assertStepUp } as unknown as AdminAuthService;
      const c = new AiWorkerController(worker, auth);
      const staff = {
        id: 'a',
        adminRole: role,
        sessionId: 's',
        justification: null,
        manageAdmins: true,
        ip: null,
      };
      const calls: Array<() => unknown> = [
        () => c.getAiWorker(staff),
        () => c.getAiWorkerItems(staff, {}),
        () =>
          c.createAiRole(staff, {
            name: 'x',
            instructions: 'y',
            queue: 'attorney_verification',
          }),
        () => c.updateAiRole(staff, { id: 'r' }, {}),
        () => c.archiveAiRole(staff, { id: 'r' }),
        () => c.startAiRun(staff, { id: 'r' }, {}),
        () => c.cancelAiRun(staff, { id: 'r' }),
        () => c.reviewAiItems(staff, { ids: ['i'], verdict: 'approved' }),
        () => c.approveBulkAiItems(staff, {}),
      ];
      for (const call of calls) {
        await expect(Promise.resolve().then(call)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      }
      expect(assertStepUp).not.toHaveBeenCalled();
    },
  );

  it('the owner passes the owner check; changes still need the 2FA step-up', async () => {
    expect(() => ownerOnly({ adminRole: 'super_admin' })).not.toThrow();
    const worker = { createRole: jest.fn().mockResolvedValue({ id: 'r' }) };
    const stepUp = new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' });
    const auth = { assertStepUp: jest.fn().mockRejectedValue(stepUp) };
    const c = new AiWorkerController(
      worker as unknown as AiWorkerService,
      auth as unknown as AdminAuthService,
    );
    await expect(
      c.createAiRole(
        {
          id: 'o',
          adminRole: 'super_admin',
          sessionId: 's',
          justification: null,
          ip: null,
        },
        { name: 'x', instructions: 'y', queue: 'attorney_verification' },
      ),
    ).rejects.toBe(stepUp);
    expect(worker.createRole).not.toHaveBeenCalled();
  });
});

describe('AI worker: structural guards', () => {
  const dir = __dirname;
  const src = (f: string) => readFileSync(path.join(dir, f), 'utf8');
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  );

  it('no raw SQL, no env, no network, no key in any file', () => {
    for (const f of files) {
      const s = src(f);
      expect({ f, raw: /\$executeRaw|\$queryRaw/.test(s) }).toEqual({
        f,
        raw: false,
      });
      expect({ f, env: /process\.env/.test(s) }).toEqual({ f, env: false });
      expect({
        f,
        net: /\bfetch\(|api\.anthropic\.com|@anthropic-ai/.test(s),
      }).toEqual({
        f,
        net: false,
      });
      expect({ f, secrets: /SecretsService|secrets\.field/.test(s) }).toEqual({
        f,
        secrets: false,
      });
    }
  });

  it('the queue loaders (the tool allowlist) only read', () => {
    const q = src('ai-worker.queues.ts');
    expect(q).not.toMatch(/\.(create|update|upsert|delete)(Many)?\(/);
    // Never money, private chats or files.
    expect(q).not.toMatch(/payment|ledger|message\.|supportMessage|file\./i);
  });

  it('the AI never acts on the queue item: the service writes only its own tables', () => {
    const s = src('ai-worker.service.ts');
    const writes = [
      ...s.matchAll(/prisma\.(\w+)\.(create|update|upsert|delete)/g),
    ].map((m) => m[1]);
    const tx = [...s.matchAll(/tx\.(\w+)\.(create|update|upsert|delete)/g)].map(
      (m) => m[1],
    );
    for (const model of [...writes, ...tx])
      expect(['aiRole', 'aiRun', 'aiRunItem']).toContain(model);
    // No tool use: the model's only output is the structured proposal.
    expect(s).not.toMatch(/tools\s*:/);
  });
});
