/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { PrismaService } from '../../prisma/prisma.service';
import {
  BATCH_LOG_KEY,
  PENDING_BATCH_KEY,
  StaffAiQaService,
  customIdOf,
  parseCustomId,
} from './staff-ai-qa.service';
import type { StaffAiContextService } from './staff-ai-context.service';
import {
  AI_ON,
  clientKit,
  messageOf,
  settingsOf,
} from './staff-ai.test-support';

const NOW = new Date('2026-10-27T04:00:00Z'); // the run covers 2026-10-26
const Y = new Date('2026-10-26T12:00:00Z');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const ADMIN1 = '11111111-1111-4111-8111-111111111111';
const ADMIN2 = '22222222-2222-4222-8222-222222222222';

interface Fixture {
  samples: Array<{
    decision_kind: string;
    item_id: string;
    decided_by: string;
    created_at: Date;
    stage: string;
    is_golden: boolean;
  }>;
  events: Array<{
    kind: string;
    item_id: string;
    admin_id: string;
    created_at: Date;
    event: string;
  }>;
  signals: Array<Record<string, unknown>>;
  created: {
    signals: Array<Record<string, unknown>>;
    samples: Array<Record<string, unknown>>;
  };
}

function setup(
  stored: Record<string, unknown>,
  fx: Partial<Fixture>,
  respond: Parameters<typeof clientKit>[1],
) {
  const kit = clientKit({ ...AI_ON, ...stored }, respond);
  const fixture: Fixture = {
    samples: fx.samples ?? [],
    events: fx.events ?? [],
    signals: fx.signals ?? [],
    created: { signals: [], samples: [] },
  };
  const prisma = {
    ...kit.db,
    staffReviewSample: {
      findMany: jest.fn(({ where, take }: { where: any; take?: number }) => {
        let rows = fixture.samples;
        if (where.created_at)
          rows = rows.filter(
            (r) =>
              r.created_at >= where.created_at.gte &&
              r.created_at < where.created_at.lt,
          );
        if (where.item_id)
          rows = rows.filter((r) => where.item_id.in.includes(r.item_id));
        if (where.stage)
          rows = rows.filter((r) => where.stage.in.includes(r.stage));
        if (where.is_golden === false) rows = rows.filter((r) => !r.is_golden);
        return Promise.resolve(rows.slice(0, take ?? 1e9));
      }),
      createMany: jest.fn(
        ({ data }: { data: Array<Record<string, unknown>> }) => {
          fixture.created.samples.push(...data);
          return Promise.resolve({ count: data.length });
        },
      ),
    },
    workLeaseEvent: {
      findMany: jest.fn(({ where, take }: { where: any; take?: number }) => {
        let rows = fixture.events.filter((r) => r.event === 'done');
        if (where.created_at)
          rows = rows.filter(
            (r) =>
              r.created_at >= where.created_at.gte &&
              r.created_at < where.created_at.lt,
          );
        if (where.item_id)
          rows = rows.filter((r) => where.item_id.in.includes(r.item_id));
        return Promise.resolve(rows.slice(0, take ?? 1e9));
      }),
    },
    staffQualitySignal: {
      findMany: jest.fn(() => Promise.resolve(fixture.signals)),
      createMany: jest.fn(
        ({ data }: { data: Array<Record<string, unknown>> }) => {
          fixture.created.signals.push(...data);
          return Promise.resolve({ count: data.length });
        },
      ),
    },
  };
  const context = {
    load: jest.fn((kind: string, id: string) =>
      Promise.resolve({
        facts: `facts of ${kind} ${id}`,
        decision: 'status: closed',
      }),
    ),
  } as unknown as StaffAiContextService;
  const svc = new StaffAiQaService(
    prisma as unknown as PrismaService,
    settingsOf({ ...AI_ON, ...stored }),
    kit.client,
    kit.budget,
    context,
  );
  return { svc, kit, prisma, fixture, context };
}

const sample = (kind: string, id: string, by = ADMIN1, stage = 'sample') => ({
  decision_kind: kind,
  item_id: id,
  decided_by: by,
  created_at: Y,
  stage,
  is_golden: false,
});

describe('custom ids', () => {
  it('round-trip kind and item id within the 64-char limit', () => {
    const id = customIdOf({ kind: 'support_ticket', itemId: A });
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(parseCustomId(id)).toEqual({ kind: 'support_ticket', itemId: A });
    expect(parseCustomId('nonsense')).toBeNull();
    expect(parseCustomId(`mystery_${A}`)).toBeNull();
  });
});

describe('StaffAiQaService: submit (night 1)', () => {
  it('takes T5-sampled cases, builds ONE batch with a cached rubric per kind and records it', async () => {
    const t = setup(
      {},
      {
        samples: [
          sample('support_ticket', A),
          sample('report', B),
          sample('review_appeal', C),
        ],
      },
      () => ({ id: 'msgbatch_1' }),
    );
    const out = await t.svc.runNightly(NOW);
    expect(out).toMatchObject({ submitted: 2, batch: 'msgbatch_1' });
    expect(t.kit.calls).toHaveLength(1);
    const reqs = t.kit.calls[0].body.requests as Array<{
      custom_id: string;
      params: any;
    }>;
    expect(reqs.map((r) => r.custom_id).sort()).toEqual([
      `report_${B}`,
      `support_ticket_${A}`,
    ]);
    expect(reqs[0].params.model).toBe('claude-haiku-5-5');
    expect(reqs[0].params.system[0].cache_control.ttl).toBe('1h');
    // hashed reference, not the id
    expect(reqs[0].params.messages[0].content).toContain('<case ref="');
    expect(reqs[0].params.messages[0].content).not.toContain(A);
    expect(t.kit.db.rows.get(PENDING_BATCH_KEY)).toMatchObject({
      id: 'msgbatch_1',
      day: '2026-10-26',
      n: 2,
    });
    const log = t.kit.db.rows.get(BATCH_LOG_KEY) as Array<{
      status: string;
      n: number;
    }>;
    expect(log[0]).toMatchObject({ status: 'submitted', n: 2 });
    expect(await t.kit.budget.spent(NOW)).toBeGreaterThan(0);
  });

  it('sonnet is selectable (model tier 1)', async () => {
    const t = setup(
      { 'staff.ai.model_tier': 1 },
      { samples: [sample('report', B)] },
      () => ({ id: 'b' }),
    );
    await t.svc.runNightly(NOW);
    expect(t.kit.calls[0].body.requests[0].params.model).toBe(
      'claude-sonnet-5-5',
    );
  });

  it('adds a random share of closed items only when qa_sample_pct > 0, up to the cap', async () => {
    const events = [A, B, C].map((id) => ({
      kind: 'verification',
      item_id: id,
      admin_id: ADMIN2,
      created_at: Y,
      event: 'done',
    }));
    const none = setup({}, { events }, () => ({ id: 'b' }));
    expect((await none.svc.runNightly(NOW)).submitted).toBe(0);
    const all = setup(
      { 'staff.ai.qa_sample_pct': 100, 'staff.ai.qa_max_cases': 2 },
      { events },
      () => ({ id: 'b' }),
    );
    expect((await all.svc.runNightly(NOW)).submitted).toBe(2);
  });

  it('skips items judged in the last days and a day that is already done', async () => {
    const t = setup(
      {},
      {
        samples: [sample('report', B)],
        signals: [{ item_kind: 'report', item_id: B }],
      },
      () => ({ id: 'b' }),
    );
    expect((await t.svc.runNightly(NOW)).submitted).toBe(0);
    const t2 = setup({}, { samples: [sample('report', B)] }, () => ({
      id: 'b',
    }));
    await t2.svc.runNightly(NOW);
    t2.kit.db.rows.set(PENDING_BATCH_KEY, {}); // pretend it was collected
    const again = await t2.svc.runNightly(NOW);
    expect(again.submitted).toBe(0);
    expect(t2.kit.calls).toHaveLength(1);
  });

  it('sizes the batch to the remaining budget and logs when nothing fits', async () => {
    const samples = Array.from({ length: 50 }, (_, i) =>
      sample(
        'report',
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ),
    );
    const small = setup({ 'staff.ai.monthly_cents': 1 }, { samples }, () => ({
      id: 'b',
    }));
    const out = await small.svc.runNightly(NOW);
    expect(Number(out.submitted)).toBeGreaterThan(0);
    expect(Number(out.submitted)).toBeLessThan(50);
    expect(await small.kit.budget.spent(NOW)).toBeLessThanOrEqual(1000);

    const zero = setup({ 'staff.ai.monthly_cents': 0 }, { samples }, () => ({
      id: 'b',
    }));
    expect(await zero.svc.runNightly(NOW)).toMatchObject({
      submitted: 0,
      reason: 'budget',
    });
    expect(zero.kit.calls).toHaveLength(0);
  });
});

describe('StaffAiQaService: collect (night 2)', () => {
  const verdict = (v: string, conf: number) => ({
    verdict: v,
    confidence: conf,
    reason: 'потому что',
    better_outcome: v === 'disagree' ? 'reject' : '',
  });
  const row = (kind: string, id: string, value: unknown) =>
    JSON.stringify({
      custom_id: `${kind}_${id}`,
      result: {
        type: 'succeeded',
        message: messageOf(value, { input_tokens: 1000, output_tokens: 100 }),
      },
    });

  function collectKit(rows: string[]) {
    return setup(
      {},
      {
        samples: [
          sample('report', A, ADMIN1),
          sample('support_ticket', B, ADMIN2),
        ],
      },
      (url) =>
        url.endsWith('/results')
          ? rows.join('\n')
          : url.includes('/batches/b1')
            ? { id: 'b1', processing_status: 'ended', request_counts: {} }
            : { id: 'b2' },
    );
  }
  const pend = (t: ReturnType<typeof setup>) =>
    t.kit.db.rows.set(PENDING_BATCH_KEY, {
      id: 'b1',
      model: 'claude-haiku-5-5',
      day: '2026-10-25',
      n: 3,
      reservedMillicents: 500,
    });

  it('stores ai_qa signals with signed confidence; a confident disagreement goes to a human; never an action', async () => {
    const t = collectKit([
      row('report', A, verdict('agree', 90)),
      row('support_ticket', B, verdict('disagree', 85)),
      row('report', C, verdict('unclear', 30)),
    ]);
    pend(t);
    await t.kit.budget.reserve('qa', 500, NOW);
    const out = await t.svc.runNightly(NOW);
    expect(out).toMatchObject({
      collected: 3,
      agree: 1,
      disagree: 1,
      unclear: 1,
      toHuman: 1,
    });
    expect(t.fixture.created.signals).toEqual([
      {
        admin_id: ADMIN1,
        kind: 'ai_qa',
        item_kind: 'report',
        item_id: A,
        value: 90,
      },
      {
        admin_id: ADMIN2,
        kind: 'ai_qa',
        item_kind: 'support_ticket',
        item_id: B,
        value: -85,
      },
    ]);
    expect(t.fixture.created.samples).toHaveLength(1);
    expect(t.fixture.created.samples[0]).toMatchObject({
      decision_kind: 'support_ticket',
      item_id: B,
      decided_by: ADMIN2,
      stage: 'ai',
    });
    expect((t.prisma as any).staffAction).toBeUndefined();
    // the reservation was replaced by the real batch price (2 x 1000in+100out ... 3 rows)
    expect(await t.kit.budget.spent(NOW)).toBeLessThan(500 + 1);
    const log = t.kit.db.rows.get(BATCH_LOG_KEY) as
      Array<{ batchId: string; status: string }> | undefined;
    expect(log?.find((e) => e.batchId === 'b1')?.status ?? 'collected').toBe(
      'collected',
    );
    // the same run then submits tonight's batch (only samples not judged yet)
    expect(t.kit.calls.some((c) => c.url.endsWith('/messages/batches'))).toBe(
      true,
    );
  });

  it('a weak disagreement is a signal but not a human task; bad answers are counted, not stored', async () => {
    const t = collectKit([
      row('report', A, verdict('disagree', 55)),
      row('support_ticket', B, { verdict: 'broken' }),
    ]);
    pend(t);
    const out = await t.svc.runNightly(NOW);
    expect(out).toMatchObject({ disagree: 1, toHuman: 0, failed: 1 });
    expect(t.fixture.created.samples).toHaveLength(0);
    expect(t.fixture.created.signals).toHaveLength(1);
  });

  it('a batch still running is left alone: no second batch, no results read', async () => {
    const t = setup({}, { samples: [sample('report', A)] }, () => ({
      id: 'b1',
      processing_status: 'in_progress',
      request_counts: {},
    }));
    t.kit.db.rows.set(PENDING_BATCH_KEY, {
      id: 'b1',
      model: 'claude-haiku-5-5',
      day: '2026-10-25',
      n: 1,
      reservedMillicents: 5,
    });
    const out = await t.svc.runNightly(NOW);
    expect(out).toMatchObject({ pendingBatch: 'b1', status: 'in_progress' });
    expect(t.kit.calls).toHaveLength(1);
  });

  it('a vanished batch (404) releases its reservation and is forgotten', async () => {
    const t = setup({}, {}, () => new Response('{}', { status: 404 }));
    await t.kit.budget.reserve('qa', 500, NOW);
    t.kit.db.rows.set(PENDING_BATCH_KEY, {
      id: 'gone',
      model: 'claude-haiku-5-5',
      day: '2026-10-25',
      n: 1,
      reservedMillicents: 500,
    });
    const out = await t.svc.runNightly(NOW);
    expect(out).toMatchObject({ lost: true });
    expect(await t.kit.budget.spent(NOW)).toBe(0);
    expect(
      (t.kit.db.rows.get(PENDING_BATCH_KEY) as { id?: string }).id,
    ).toBeUndefined();
  });
});
