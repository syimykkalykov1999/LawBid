import { DataExportService } from './data-export.service';

/**
 * Verify 18.11 (PV7 / PV8): what the person's export contains. A recording
 * prisma: every model answers one row (or none) and keeps the arguments.
 */
function build(rowsOf: Record<string, unknown[]> = {}) {
  const calls: { model: string; op: string; arg: unknown }[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => (arg: unknown) => {
          calls.push({ model: name, op, arg });
          if (op === 'count') return Promise.resolve(0);
          if (op === 'findUnique' || op === 'findFirst')
            return Promise.resolve(null);
          const a = arg as { cursor?: unknown; skip?: number } | undefined;
          // One page only: a cursor / offset read after the first is empty.
          if (a?.cursor || (a?.skip ?? 0) > 0) return Promise.resolve([]);
          return Promise.resolve(rowsOf[name] ?? []);
        },
      },
    );
  const prisma = new Proxy({}, { get: (_t, k: string) => model(k) });
  const svc = new DataExportService(
    prisma as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
    { sendEmail: jest.fn() },
    { setContext: jest.fn(), warn: jest.fn() } as never,
  );
  return { svc, calls };
}

const selectOf = (
  calls: { model: string; op: string; arg: unknown }[],
  model: string,
) =>
  (
    calls.find((c) => c.model === model && c.op === 'findMany')?.arg as
      { select?: Record<string, unknown> } | undefined
  )?.select;

describe('DataExportService support.json (verify 18.11, PV7)', () => {
  it('exports the person’s tickets and public messages without staff ids or internal SLA fields', async () => {
    const { svc, calls } = build({
      supportTicket: [{ id: 't1' }],
    });
    await svc.collect('u1');
    const ticket = selectOf(calls, 'supportTicket');
    expect(ticket).toBeDefined();
    for (const internal of [
      'assignee_id',
      'first_response_by',
      'resolved_by',
      'priority',
      'sla_due_at',
      'sla_breached_at',
      'unread_by_admin',
      'assigned_at',
    ]) {
      expect(ticket).not.toHaveProperty(internal);
    }
    expect(ticket).toMatchObject({ id: true, subject: true, status: true });
    const msgCall = calls.find(
      (c) =>
        c.model === 'supportMessage' &&
        c.op === 'findMany' &&
        (c.arg as { where?: { internal?: boolean } }).where?.internal === false,
    );
    const msg = (msgCall?.arg as { select?: Record<string, unknown> })?.select;
    expect(msg).toBeDefined();
    expect(msg).not.toHaveProperty('author_admin_id');
    expect(msg).toMatchObject({ id: true, body: true, created_at: true });
  });
});

describe('DataExportService owner-authored categories (verify 18.11, PV8)', () => {
  it('includes legal Q&A, channels, saved items, quick replies, reposts, purchases, case updates and reports', async () => {
    const { svc, calls } = build({
      legalQuestion: [{ id: 'q1', title: 'T' }],
      legalAnswer: [{ id: 'a1', body: 'B' }],
      channelPost: [{ id: 'cp1', body: 'P' }],
      channelComment: [{ id: 'cc1', body: 'C' }],
      savedItem: [{ item_type: 'post', item_id: 'p1' }],
      quickReply: [{ id: 'qr1', body: 'Hi' }],
      payment: [{ id: 'pay1', amount_cents: 100 }],
    });
    const out = await svc.collect('u1');
    expect(out['legal-qa.json']).toEqual({
      questions: [{ id: 'q1', title: 'T' }],
      answers: [{ id: 'a1', body: 'B' }],
    });
    expect(out['channels.json']).toMatchObject({
      posts: [{ id: 'cp1', body: 'P' }],
      comments: [{ id: 'cc1', body: 'C' }],
    });
    expect(out['saved.json']).toMatchObject({
      items: [{ item_type: 'post', item_id: 'p1' }],
    });
    expect(out['quick-replies.json']).toEqual([{ id: 'qr1', body: 'Hi' }]);
    expect(out['purchases.json']).toMatchObject({
      payments: [{ id: 'pay1', amount_cents: 100 }],
    });
    for (const f of ['reposts.json', 'case-updates.json', 'reports.json']) {
      expect(out).toHaveProperty([f]);
    }
    // Only the person's own rows, and no moderation internals.
    const q = calls.find((c) => c.model === 'legalQuestion')?.arg as {
      where: unknown;
      select: Record<string, unknown>;
    };
    expect(q.where).toEqual({ author_id: 'u1' });
    expect(q.select).not.toHaveProperty('safety_flags');
    expect(q.select).not.toHaveProperty('content_hash');
    const r = calls.find((c) => c.model === 'report')?.arg as {
      where: unknown;
      select: Record<string, unknown>;
    };
    expect(r.where).toEqual({ reporter_id: 'u1' });
    expect(r.select).not.toHaveProperty('handled_by');
    // Bounded: every new read is paged.
    for (const m of [
      'legalQuestion',
      'legalAnswer',
      'channel',
      'channelPost',
      'channelComment',
      'savedItem',
      'savedChatMessage',
      'quickReply',
      'postRepost',
      'payment',
      'bidPackPurchase',
      'refund',
      'caseUpdate',
      'report',
    ]) {
      const c = calls.find((x) => x.model === m && x.op === 'findMany');
      expect(c).toBeDefined();
      expect((c?.arg as { take?: number }).take).toBe(1000);
    }
  });
});
