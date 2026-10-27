/* eslint-disable @typescript-eslint/no-unsafe-call */
import { QA_SCHEMA, hintSchema } from './staff-ai-schemas';
import {
  StaffAiApiError,
  StaffAiBudgetError,
  StaffAiNotConfiguredError,
  StaffAiNotEnabledError,
  StaffAiSchemaError,
  StaffAiTimeoutError,
} from './staff-ai.types';
import { AI_ON, clientKit, messageOf } from './staff-ai.test-support';

const SYSTEM = [{ text: 'rubric', cacheTtl: '1h' as const }];
const GOOD = {
  verdict: 'agree',
  confidence: 80,
  reason: 'ok',
  better_outcome: '',
};

const ask = (kit: ReturnType<typeof clientKit>, user = 'case text') =>
  kit.client.message({
    feature: 'qa',
    model: 'claude-haiku-5-5',
    system: SYSTEM,
    user,
    schema: QA_SCHEMA,
    maxTokens: 300,
    timeoutMs: 3000,
  });

describe('StaffAiClient: OFF means not one call', () => {
  const OFF_CASES: Array<[string, Record<string, unknown>]> = [
    ['everything off (the default)', {}],
    ['sub-switch on, master off', { 'staff.ai_qa_enabled': true }],
    ['master on, feature switch off', { 'staff.ai_enabled': true }],
  ];

  it.each(OFF_CASES)(
    '%s: typed NotEnabled, zero network calls, key never read, budget untouched',
    async (_n, stored) => {
      const kit = clientKit(stored, () => messageOf(GOOD));
      await expect(ask(kit)).rejects.toBeInstanceOf(StaffAiNotEnabledError);
      await expect(
        kit.client.submitBatch({
          model: 'claude-haiku-5-5',
          schema: QA_SCHEMA,
          maxTokens: 300,
          items: [{ customId: 'c1', system: SYSTEM, user: 'x' }],
        }),
      ).rejects.toBeInstanceOf(StaffAiNotEnabledError);
      await expect(kit.client.batchStatus('b1')).rejects.toBeInstanceOf(
        StaffAiNotEnabledError,
      );
      await expect(
        kit.client.batchResults('b1', 'claude-haiku-5-5', QA_SCHEMA),
      ).rejects.toBeInstanceOf(StaffAiNotEnabledError);
      expect(kit.calls).toHaveLength(0);
      expect(kit.secrets.field).not.toHaveBeenCalled();
      expect(kit.redis.kv.size).toBe(0);
    },
  );

  it('the hint feature has its own switch: qa on does not open hint', async () => {
    const kit = clientKit(
      { 'staff.ai_enabled': true, 'staff.ai_qa_enabled': true },
      () => messageOf(GOOD),
    );
    await expect(
      kit.client.message({
        feature: 'hint',
        model: 'claude-haiku-5-5',
        system: SYSTEM,
        user: 'x',
        schema: hintSchema('report'),
        maxTokens: 100,
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(StaffAiNotEnabledError);
    expect(kit.calls).toHaveLength(0);
  });
});

describe('StaffAiClient: Messages call', () => {
  it('sends a structured, cached, sampling-free request with the key from the secrets service', async () => {
    const kit = clientKit(AI_ON, () => messageOf(GOOD));
    const res = await ask(kit);
    expect(res.value).toEqual({
      verdict: 'agree',
      confidence: 80,
      reason: 'ok',
      betterOutcome: '',
    });
    expect(kit.calls).toHaveLength(1);
    const c = kit.calls[0];
    expect(c.url).toBe('https://api.anthropic.com/v1/messages');
    expect(c.method).toBe('POST');
    expect(c.headers['x-api-key']).toBe('sk-ant-test-0000000000000000');
    expect(c.headers['anthropic-version']).toBe('2026-10-21');
    expect(c.body.model).toBe('claude-haiku-5-5');
    expect(c.body.max_tokens).toBe(300);
    expect(c.body.system[0].cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
    expect(c.body.output_config.format.type).toBe('json_schema');
    expect(c.body.output_config.format.schema.additionalProperties).toBe(false);
    for (const forbidden of [
      'temperature',
      'top_p',
      'top_k',
      'thinking',
      'tool_choice',
    ]) {
      expect(c.body).not.toHaveProperty(forbidden);
    }
    expect(kit.secrets.field).toHaveBeenCalledWith('anthropic', 'apiKey');
  });

  it('scrubs e-mails, phones and ids out of whatever the caller passes', async () => {
    const kit = clientKit(AI_ON, () => messageOf(GOOD));
    await ask(
      kit,
      'client jane@mail.com +1 (218) 551-6788 passport AB1234567 asks for a refund',
    );
    const sent = JSON.stringify(kit.calls[0].body);
    expect(sent).not.toMatch(/jane@mail\.com|551-6788|AB1234567/);
    expect(sent).toContain('asks for a refund');
  });

  it('settles the reservation to the real usage', async () => {
    const kit = clientKit(AI_ON, () =>
      messageOf(GOOD, { input_tokens: 1000, output_tokens: 100 }),
    );
    const res = await ask(kit);
    expect(await kit.budget.spent()).toBe(res.costMillicents);
    expect(res.costMillicents).toBe(15); // 1000 in @10c/M + 100 out @50c/M = 0.015c
  });

  it('no key in «Ключи и сервисы»: typed NotConfigured, no call', async () => {
    const kit = clientKit(AI_ON, () => messageOf(GOOD), null);
    await expect(ask(kit)).rejects.toBeInstanceOf(StaffAiNotConfiguredError);
    expect(kit.calls).toHaveLength(0);
  });

  it('at the monthly ceiling the call is not made', async () => {
    const kit = clientKit({ ...AI_ON, 'staff.ai.monthly_cents': 0 }, () =>
      messageOf(GOOD),
    );
    await expect(ask(kit)).rejects.toBeInstanceOf(StaffAiBudgetError);
    expect(kit.calls).toHaveLength(0);
  });

  it('rejects an answer that is not JSON, breaks the schema, is cut off or refused', async () => {
    const bad = (text: string, stop = 'end_turn') => ({
      content: [{ type: 'text', text }],
      stop_reason: stop,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    await expect(
      ask(clientKit(AI_ON, () => bad('not json'))),
    ).rejects.toBeInstanceOf(StaffAiSchemaError);
    await expect(
      ask(
        clientKit(AI_ON, () =>
          bad(JSON.stringify({ ...GOOD, verdict: 'maybe' })),
        ),
      ),
    ).rejects.toBeInstanceOf(StaffAiSchemaError);
    await expect(ask(clientKit(AI_ON, () => bad('{}')))).rejects.toBeInstanceOf(
      StaffAiSchemaError,
    );
    await expect(
      ask(clientKit(AI_ON, () => bad('{', 'max_tokens'))),
    ).rejects.toBeInstanceOf(StaffAiApiError);
    await expect(
      ask(clientKit(AI_ON, () => bad('', 'refusal'))),
    ).rejects.toBeInstanceOf(StaffAiApiError);
  });

  it('clamps confidence into 0..100 and shortens a long reason', async () => {
    const kit = clientKit(AI_ON, () =>
      messageOf({
        verdict: 'disagree',
        confidence: 250,
        reason: 'x'.repeat(900),
        better_outcome: 'reject',
      }),
    );
    const res = await ask(kit);
    expect(res.value.confidence).toBe(100);
    expect(res.value.reason.length).toBe(240);
  });

  it('an HTTP error gives the reservation back (nothing was billed)', async () => {
    const kit = clientKit(
      AI_ON,
      () =>
        new Response(JSON.stringify({ error: { message: 'overloaded' } }), {
          status: 529,
        }),
    );
    await expect(ask(kit)).rejects.toMatchObject({ status: 529 });
    expect(await kit.budget.spent()).toBe(0);
  });

  it('a timeout is typed and keeps the worst case reserved (it may be billed)', async () => {
    const kit = clientKit(AI_ON, () => new Promise(() => undefined));
    // An http mock that never answers but honours the abort signal.
    (kit.client as unknown as { http: unknown }).http = (
      _u: string,
      init: RequestInit,
    ) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      });
    await expect(
      kit.client.message({
        feature: 'qa',
        model: 'claude-haiku-5-5',
        system: SYSTEM,
        user: 'x',
        schema: QA_SCHEMA,
        maxTokens: 300,
        timeoutMs: 20,
      }),
    ).rejects.toBeInstanceOf(StaffAiTimeoutError);
    expect(await kit.budget.spent()).toBeGreaterThan(0);
  });
});

describe('StaffAiClient: Batches', () => {
  it('submits one batch with a cached rubric per item and reserves the batch price', async () => {
    const kit = clientKit(AI_ON, () => ({ id: 'msgbatch_1' }));
    const { batchId, reservation } = await kit.client.submitBatch({
      model: 'claude-haiku-5-5',
      schema: QA_SCHEMA,
      maxTokens: 400,
      items: [
        { customId: 'report_a', system: SYSTEM, user: 'mail me at a@b.co' },
        { customId: 'verification_b', system: SYSTEM, user: 'y' },
      ],
    });
    expect(batchId).toBe('msgbatch_1');
    expect(kit.calls).toHaveLength(1);
    expect(kit.calls[0].url).toBe(
      'https://api.anthropic.com/v1/messages/batches',
    );
    const reqs = kit.calls[0].body.requests;
    expect(reqs.map((r: { custom_id: string }) => r.custom_id)).toEqual([
      'report_a',
      'verification_b',
    ]);
    expect(reqs[0].params.system[0].cache_control.ttl).toBe('1h');
    expect(JSON.stringify(reqs)).not.toContain('a@b.co');
    expect(reservation.millicents).toBeGreaterThan(0);
    expect(await kit.budget.spent()).toBe(reservation.millicents);
  });

  it('a failed submit gives the reservation back; an empty batch is refused', async () => {
    const kit = clientKit(AI_ON, () => new Response('{}', { status: 500 }));
    await expect(
      kit.client.submitBatch({
        model: 'claude-haiku-5-5',
        schema: QA_SCHEMA,
        maxTokens: 400,
        items: [{ customId: 'report_a', system: SYSTEM, user: 'x' }],
      }),
    ).rejects.toBeInstanceOf(StaffAiApiError);
    expect(await kit.budget.spent()).toBe(0);
    await expect(
      kit.client.submitBatch({
        model: 'claude-haiku-5-5',
        schema: QA_SCHEMA,
        maxTokens: 1,
        items: [],
      }),
    ).rejects.toBeInstanceOf(StaffAiApiError);
  });

  it('reads status and JSONL results in any order, validates each, bills at batch price', async () => {
    const line = (id: string, value: unknown, extra: object = {}) =>
      JSON.stringify({
        custom_id: id,
        result: {
          type: 'succeeded',
          message: messageOf(value, { input_tokens: 1000, output_tokens: 100 }),
          ...extra,
        },
      });
    const jsonl = [
      line('report_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', GOOD),
      line('report_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', {
        ...GOOD,
        verdict: 'nope',
      }),
      JSON.stringify({
        custom_id: 'report_cccccccc-cccc-cccc-cccc-cccccccccccc',
        result: { type: 'expired' },
      }),
      'not a json line',
    ].join('\n');
    const kit = clientKit(AI_ON, (url) =>
      url.endsWith('/results')
        ? jsonl
        : {
            id: 'b1',
            processing_status: 'ended',
            request_counts: { succeeded: 2, errored: 0, expired: 1 },
          },
    );
    const st = await kit.client.batchStatus('b1');
    expect(st).toMatchObject({ status: 'ended', succeeded: 2, expired: 1 });
    const out = await kit.client.batchResults(
      'b1',
      'claude-haiku-5-5',
      QA_SCHEMA,
    );
    expect(out.results.map((r) => [r.customId.slice(0, 8), r.ok])).toEqual([
      ['report_a', true],
      ['report_b', false],
      ['report_c', false],
    ]);
    // two answered rows: 2 x (1000 in + 100 out) at half price = 2 x 7.5 -> 8 each (ceil)
    expect(out.costMillicents).toBe(16);
  });
});
