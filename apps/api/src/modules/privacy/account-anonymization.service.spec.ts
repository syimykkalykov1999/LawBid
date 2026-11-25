import { Prisma } from '../../generated/prisma/client';
import {
  AccountAnonymizationService,
  ERASED_USERNAME_HOLDER,
} from './account-anonymization.service';
import { DELETED_MESSAGE_BODY, DELETION_GRACE_DAYS } from './privacy.constants';

/**
 * Verify 18.11 (PV1 / PV2 / PV4 / PV5): the account erasure against a
 * recording prisma. Every model answers "nothing" unless told otherwise;
 * every call (and every raw SQL text) is kept for the assertions.
 */
type Call = { model: string; op: string; arg: unknown };
type Handler = (arg: unknown, calls: Call[]) => unknown;

const NOW = new Date('2026-11-18T12:00:00.000Z');
const PAST_GRACE = new Date(
  NOW.getTime() - (DELETION_GRACE_DAYS + 1) * 86_400_000,
);
const UID = 'aaaaaaaa-0000-4000-8000-000000000001';

function user(over: Record<string, unknown> = {}) {
  return {
    id: UID,
    role: 'client',
    status: 'deletion_pending',
    anonymized_at: null,
    deletion_requested_at: PAST_GRACE,
    avatar_file_id: null,
    phone_e164: '+15550001111',
    subscription: null,
    ...over,
  };
}

function build(handlers: Record<string, Handler> = {}) {
  const calls: Call[] = [];
  const sql: string[] = [];
  const defaults = (op: string): unknown => {
    if (op === 'findMany') return [];
    if (op === 'findUnique' || op === 'findFirst') return null;
    if (op === 'count') return 0;
    return { count: 1 };
  };
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => (arg: unknown) => {
          calls.push({ model: name, op, arg });
          const h = handlers[`${name}.${op}`];
          return Promise.resolve(h ? h(arg, calls) : defaults(op));
        },
      },
    );
  const raw =
    (kind: string) =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = Prisma.sql(strings, ...values).sql;
      sql.push(text);
      calls.push({ model: '$raw', op: kind, arg: text });
      return Promise.resolve(kind === '$queryRaw' ? [] : 0);
    };
  const prisma: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === '$executeRaw') return raw('$executeRaw');
        if (k === '$queryRaw') return raw('$queryRaw');
        if (k === '$transaction')
          return (fn: (tx: unknown) => unknown) => fn(prisma);
        if (typeof k === 'symbol') return undefined;
        return model(k);
      },
    },
  );
  const payments = {
    deleteCustomer: jest.fn(() => Promise.resolve()),
    retrieveSubscription: jest.fn(),
    cancelNow: jest.fn(),
  };
  const release = { release: jest.fn(() => Promise.resolve()) };
  const lifecycle = {
    closeCasesOfDeletedUser: jest.fn(() => Promise.resolve()),
    archiveOpenCasesOfClient: jest.fn(() => Promise.resolve()),
  };
  const steps = {
    run: jest.fn(
      async (_u: string, _s: string, fn: () => Promise<{ status: string }>) => {
        try {
          return (await fn()).status;
        } catch {
          return 'failed';
        }
      },
    ),
    record: jest.fn(() => Promise.resolve()),
  };
  const vendors = {
    purgeTwilio: jest.fn(() =>
      Promise.resolve({ status: 'ok', detail: 'removed' }),
    ),
    recordRetained: jest.fn(() => Promise.resolve()),
  };
  const ledger = {
    record: jest.fn(() => Promise.resolve()),
    syncToStore: jest.fn(() => Promise.resolve(true)),
  };
  const svc = new AccountAnonymizationService(
    prisma as never,
    release as never,
    lifecycle as never,
    {} as never,
    { invalidate: jest.fn(() => Promise.resolve()) } as never,
    {
      applyToActive: jest.fn(() => Promise.resolve([])),
    } as never,
    { append: jest.fn() } as never,
    payments as never,
    { set: jest.fn(), publish: jest.fn() } as never,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never,
    undefined,
    undefined,
    undefined,
    ledger as never,
    steps as never,
    vendors as never,
  );
  const did = (m: string, op: string) =>
    calls.filter((c) => c.model === m && c.op === op);
  return { svc, calls, sql, did, payments, release, ledger, steps, vendors };
}

/** The user row the service reads: first the outer read, then the
 * in-transaction re-read (status may have changed in between). */
const userReads = (...rows: unknown[]): Handler => {
  let i = 0;
  return () => rows[Math.min(i++, rows.length - 1)];
};

describe('AccountAnonymizationService — a cancelled deletion is never erased (PV1)', () => {
  it('a queued job for an account whose deletion was cancelled does nothing', async () => {
    const t = build({
      'user.findUnique': userReads(
        user({ status: 'active', deletion_requested_at: null }),
      ),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(false);
    expect(t.payments.deleteCustomer).not.toHaveBeenCalled();
    expect(t.release.release).not.toHaveBeenCalled();
    expect(t.sql).toEqual([]);
    expect(t.ledger.record).not.toHaveBeenCalled();
  });

  it('a request still inside the grace period is not erased by a due run', async () => {
    const t = build({
      'user.findUnique': userReads(
        user({ deletion_requested_at: new Date(NOW.getTime() - 86_400_000) }),
      ),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(false);
    expect(t.release.release).not.toHaveBeenCalled();
  });

  it('claims the account (deletion_pending -> deleted) before any side effect, so a later cancel fails', async () => {
    const t = build({
      'user.findUnique': userReads(user(), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(true);
    const claim = t.did('user', 'updateMany')[0];
    expect(claim.arg).toMatchObject({
      where: {
        id: UID,
        status: 'deletion_pending',
        anonymized_at: null,
      },
      data: { status: 'deleted' },
    });
    const claimAt = t.calls.indexOf(claim);
    const firstSideEffect = t.calls.findIndex(
      (c) => c.model === 'story' && c.op === 'deleteMany',
    );
    expect(claimAt).toBeGreaterThanOrEqual(0);
    expect(claimAt).toBeLessThan(firstSideEffect);
  });

  it('a cancel that wins the race before the claim leaves the account alone', async () => {
    const t = build({
      'user.findUnique': userReads(user()),
      'user.updateMany': () => ({ count: 0 }),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(false);
    expect(t.release.release).not.toHaveBeenCalled();
    expect(t.sql).toEqual([]);
  });

  it('the final transaction re-checks the claim and writes nothing when it is gone', async () => {
    const t = build({
      'user.findUnique': userReads(user(), {
        anonymized_at: null,
        status: 'active',
      }),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(false);
    expect(t.ledger.record).not.toHaveBeenCalled();
    expect(t.did('user', 'update')).toEqual([]);
  });

  it('resumes an account it already claimed (a crashed run), status deleted', async () => {
    const t = build({
      'user.findUnique': userReads(user({ status: 'deleted' }), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(true);
    expect(t.ledger.record).toHaveBeenCalled();
  });

  it('other callers (admin minor erasure, restore re-apply) keep working on an active account', async () => {
    const t = build({
      'user.findUnique': userReads(
        user({ status: 'active', deletion_requested_at: null }),
        { anonymized_at: null, status: 'active' },
      ),
    });
    expect(await t.svc.anonymize(UID, NOW, 'restore_reapply')).toBe(true);
    expect(t.ledger.record).toHaveBeenCalled();
  });
});

describe('AccountAnonymizationService — legal holds (PV2)', () => {
  it('a hold on a case where the person is the attorney holds the account', async () => {
    const t = build({
      'legalHold.findMany': (arg) =>
        (arg as { where: { AND: [unknown, { target_type: string }] } }).where
          .AND[1].target_type === 'case'
          ? [{ target_id: 'case-1' }]
          : [],
      'case.count': (arg) =>
        JSON.stringify(arg).includes('accepted_bid') ? 1 : 0,
    });
    expect(await t.svc.isOnLegalHold(UID, NOW)).toBe(true);
    const where = JSON.stringify(t.did('case', 'count')[0].arg);
    expect(where).toContain('"client_id"');
    expect(where).toContain('"attorney_id"');
  });

  it('never scrubs messages of a held conversation / case chat, or group messages of a held group', async () => {
    const t = build({
      'user.findUnique': userReads(user(), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true });
    const messages = t.sql.filter((s) => /UPDATE messages/.test(s));
    const edits = t.sql.filter((s) => /UPDATE message_edits/.test(s));
    const tokens = t.sql.filter((s) =>
      /DELETE FROM message_search_tokens/.test(s),
    );
    const groups = t.sql.filter((s) => /UPDATE chat_group_messages/.test(s));
    for (const s of [...messages, ...edits, ...tokens]) {
      expect(s).toContain('legal_holds');
      expect(s).toMatch(/target_type = (\$\d+|\?)/);
    }
    expect(groups.length).toBeGreaterThan(0);
    for (const s of groups) expect(s).toContain('legal_holds');
    // The hold types asked for: conversation and case (messages), group.
    const values = t.calls
      .filter((c) => c.model === '$raw')
      .map((c) => c.arg as string)
      .join('\n');
    expect(values).toContain('legal_holds');
  });
});

describe('AccountAnonymizationService — registry «scrub» rows really scrubbed (PV4)', () => {
  it('support texts, the client @handle, handle holds and task links of the person are scrubbed', async () => {
    const t = build({
      'user.findUnique': userReads(user(), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    expect(
      await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).toBe(true);
    expect(t.did('supportMessage', 'updateMany')[0]?.arg).toMatchObject({
      where: { author_user_id: UID },
      data: { body: DELETED_MESSAGE_BODY },
    });
    expect(t.did('supportTicket', 'updateMany')[0]?.arg).toMatchObject({
      where: { user_id: UID },
      data: { subject: DELETED_MESSAGE_BODY, client_context: Prisma.DbNull },
    });
    expect(
      t.did('clientProfile', 'updateMany').map((c) => c.arg),
    ).toContainEqual(
      expect.objectContaining({
        where: { user_id: UID },
        data: expect.objectContaining({
          username: 'deleted_aaaaaaaa',
          username_lower: 'deleted_aaaaaaaa',
        }),
      }),
    );
    const holdAt = t.calls.findIndex(
      (c) => c.model === 'usernameHold' && c.op === 'updateMany',
    );
    const handleAt = t.calls.findIndex(
      (c) =>
        c.model === 'clientProfile' &&
        c.op === 'updateMany' &&
        JSON.stringify(c.arg).includes('deleted_'),
    );
    expect(holdAt).toBeGreaterThan(handleAt);
    expect(t.calls[holdAt].arg).toEqual({
      where: { holder_user_id: UID },
      data: { holder_user_id: ERASED_USERNAME_HOLDER },
    });
    // hotline plan PR 7: the review words and the topic go, the stars stay
    expect(t.did('hotlineCall', 'updateMany')[0]?.arg).toEqual({
      where: {
        client_id: UID,
        OR: [{ review_comment: { not: null } }, { topic: { not: null } }],
      },
      data: { review_comment: null, topic: null },
    });
    expect(t.did('attorneyTaskPerson', 'updateMany')[0]?.arg).toEqual({
      where: { user_id: UID },
      data: { user_id: null, phone: null, email: null },
    });
  });

  it('PV4: a demo account loses its admin label with the erased person', async () => {
    const t = build({
      'user.findUnique': userReads(user({ role: 'client' }), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true });
    expect(t.did('demoAccount', 'updateMany')[0]?.arg).toEqual({
      where: { demo_user_id: UID },
      data: { label: null, display_name: 'Deleted' },
    });
  });

  it("an attorney's own planner tasks go with the account", async () => {
    const t = build({
      'user.findUnique': userReads(user({ role: 'attorney' }), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    await t.svc.anonymize(UID, NOW, 'deletion_request', { due: true });
    expect(t.did('attorneyTask', 'deleteMany')[0]?.arg).toEqual({
      where: { attorney_id: UID },
    });
  });
});

describe('AccountAnonymizationService — a failed Twilio purge is retried (PV5)', () => {
  it('stops before the phone number is erased, so the next attempt still knows it', async () => {
    const t = build({
      'user.findUnique': userReads(user(), {
        anonymized_at: null,
        status: 'deleted',
      }),
    });
    t.vendors.purgeTwilio.mockRejectedValueOnce(new Error('Twilio 500'));
    await expect(
      t.svc.anonymize(UID, NOW, 'deletion_request', { due: true }),
    ).rejects.toThrow(/twilio/i);
    expect(t.did('user', 'update')).toEqual([]);
    expect(t.ledger.record).not.toHaveBeenCalled();
  });
});

describe('AccountAnonymizationService.dueUserIds (PV1 resume)', () => {
  it('also picks up an account a crashed run already claimed (deleted, not yet anonymized)', async () => {
    const t = build();
    await t.svc.dueUserIds(NOW);
    const where = (t.did('user', 'findMany')[0].arg as { where: unknown })
      .where as { status: unknown; anonymized_at: unknown };
    expect(where.status).toEqual({ in: ['deletion_pending', 'deleted'] });
    expect(where.anonymized_at).toBeNull();
  });
});
