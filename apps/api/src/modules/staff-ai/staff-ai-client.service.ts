import { Inject, Injectable, Optional } from '@nestjs/common';
import { SecretsService } from '../../common/secrets/secrets.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  StaffAiBudgetService,
  type StaffAiReservation,
} from './staff-ai-budget.service';
import { scrubPii } from './staff-ai-pii';
import {
  costMillicents,
  estimateMillicents,
  estimateTokens,
} from './staff-ai-pricing';
import {
  FEATURE_SWITCH,
  StaffAiApiError,
  StaffAiNotConfiguredError,
  StaffAiNotEnabledError,
  StaffAiSchemaError,
  StaffAiTimeoutError,
  type StaffAiFeature,
  type StaffAiModel,
  type StaffAiUsage,
} from './staff-ai.types';

/** The transport. Tests inject a mock; production uses the global fetch. */
export const STAFF_AI_FETCH = Symbol('STAFF_AI_FETCH');
export type StaffAiFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

const API_BASE = 'https://api.anthropic.com';
/** API version of the Messages / Batches API (2026-10-21 line). */
const API_VERSION = '2026-10-21';
const SECRET_PROVIDER = 'anthropic';

/** A JSON Schema for Claude's structured output plus the validator that
 * checks (and clamps) what came back. The model is never trusted. */
export interface AiSchema<T> {
  name: string;
  json: Record<string, unknown>;
  parse(raw: unknown): T;
}

/** A system-prompt block; `cacheTtl` marks the end of a cached prefix. */
export interface AiSystemBlock {
  text: string;
  cacheTtl?: '5m' | '1h';
}

export interface AiMessageRequest<T> {
  feature: StaffAiFeature;
  model: StaffAiModel;
  system: AiSystemBlock[];
  /** Goes through the PII scrubber before it leaves. */
  user: string;
  schema: AiSchema<T>;
  maxTokens: number;
  timeoutMs: number;
}

export interface AiMessageResult<T> {
  value: T;
  usage: StaffAiUsage;
  model: StaffAiModel;
  costMillicents: number;
}

export interface AiBatchItem {
  /** [a-zA-Z0-9_-]{1,64}: returned with the result, in any order. */
  customId: string;
  /** The (cached) rubric of this item's kind. */
  system: AiSystemBlock[];
  user: string;
}

export interface AiBatchRequest<T> {
  model: StaffAiModel;
  schema: AiSchema<T>;
  maxTokens: number;
  items: AiBatchItem[];
}

export interface AiBatchStatus {
  id: string;
  status: 'in_progress' | 'canceling' | 'ended';
  succeeded: number;
  errored: number;
  expired: number;
  canceled: number;
  resultsUrl: string | null;
}

export type AiBatchResult<T> =
  | { customId: string; ok: true; value: T; usage: StaffAiUsage }
  | { customId: string; ok: false; error: string; usage?: StaffAiUsage };

interface WireMessage {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string | null;
  usage?: StaffAiUsage;
}

/**
 * Staff package T12: the ONE gate to the Claude API for staff AI mode.
 *  - `assertEnabled` runs first in every public method: with `staff.ai_enabled`
 *    (or the feature's own sub-switch) off it throws StaffAiNotEnabledError
 *    before the key is read, the budget touched or any network call made;
 *  - the key comes from «Ключи и сервисы» (SecretsService provider
 *    `anthropic`), never from code or env;
 *  - every call reserves its worst-case price in StaffAiBudgetService and is
 *    settled to the real usage; at the monthly ceiling calls stop;
 *  - all outgoing user text is PII-scrubbed here, whatever the caller did;
 *  - answers are structured outputs (`output_config.format` json_schema) and
 *    validated against the caller's schema.
 * Thin on purpose: Messages + Batches over fetch (the repo's way for vendor
 * calls), no tool use, no sampling parameters, no prefill.
 */
@Injectable()
export class StaffAiClient {
  private readonly http: StaffAiFetch;

  constructor(
    private readonly staff: StaffSettingsService,
    private readonly secrets: SecretsService,
    private readonly budget: StaffAiBudgetService,
    @Optional() @Inject(STAFF_AI_FETCH) http?: StaffAiFetch,
  ) {
    this.http = http ?? ((url, init) => fetch(url, init));
  }

  async isEnabled(feature: StaffAiFeature): Promise<boolean> {
    const s = await this.staff.get();
    return (
      s.switches['staff.ai_enabled'] && s.switches[FEATURE_SWITCH[feature]]
    );
  }

  /** Throws StaffAiNotEnabledError unless master AND feature switch are on. */
  async assertEnabled(feature: StaffAiFeature): Promise<void> {
    if (!(await this.isEnabled(feature))) {
      throw new StaffAiNotEnabledError(feature);
    }
  }

  /** What one case costs at most (used to size a night's batch). */
  estimateItemMillicents(
    model: StaffAiModel,
    system: AiSystemBlock[],
    user: string,
    maxTokens: number,
    batch: boolean,
  ): number {
    const tokens =
      estimateTokens(system.map((b) => b.text).join('')) + estimateTokens(user);
    return estimateMillicents(model, tokens, maxTokens, batch);
  }

  // ---------------------------------------------------------------- Messages

  /** One synchronous Messages call (desk hint, recommendation text). */
  async message<T>(req: AiMessageRequest<T>): Promise<AiMessageResult<T>> {
    await this.assertEnabled(req.feature);
    const apiKey = await this.apiKey();
    const params = this.params(
      req.model,
      req.system,
      scrubPii(req.user),
      req.schema,
      req.maxTokens,
    );
    const est = this.estimateItemMillicents(
      req.model,
      req.system,
      req.user,
      req.maxTokens,
      false,
    );
    const reservation = await this.budget.reserve(req.feature, est);
    let wire: WireMessage;
    try {
      wire = (await this.call(
        'POST',
        '/v1/messages',
        apiKey,
        params,
        req.timeoutMs,
      )) as WireMessage;
    } catch (e) {
      // A timeout may still be billed: keep the worst case reserved. Any
      // other failure was refused before billing: give the reservation back.
      if (!(e instanceof StaffAiTimeoutError))
        await this.budget.release(reservation);
      throw e;
    }
    const usage = wire.usage ?? { input_tokens: 0, output_tokens: 0 };
    const cost = costMillicents(req.model, usage, false);
    await this.budget.settle(reservation, cost);
    const value = this.answer(wire, req.schema);
    return { value, usage, model: req.model, costMillicents: cost };
  }

  // ----------------------------------------------------------------- Batches

  /**
   * Submits ONE batch (Batches API: half price, results within 24 h). The
   * whole batch's worst case is reserved first; the caller settles it with
   * the real cost after `batchResults`.
   */
  async submitBatch<T>(
    req: AiBatchRequest<T>,
  ): Promise<{ batchId: string; reservation: StaffAiReservation }> {
    await this.assertEnabled('qa');
    if (req.items.length === 0) throw new StaffAiApiError('empty batch');
    const apiKey = await this.apiKey();
    const est = req.items.reduce(
      (sum, i) =>
        sum +
        this.estimateItemMillicents(
          req.model,
          i.system,
          i.user,
          req.maxTokens,
          true,
        ),
      0,
    );
    const reservation = await this.budget.reserve('qa', est);
    try {
      const body = {
        requests: req.items.map((i) => ({
          custom_id: i.customId,
          params: this.params(
            req.model,
            i.system,
            scrubPii(i.user),
            req.schema,
            req.maxTokens,
          ),
        })),
      };
      const out = (await this.call(
        'POST',
        '/v1/messages/batches',
        apiKey,
        body,
        120_000,
      )) as {
        id?: string;
      };
      if (!out.id) throw new StaffAiApiError('batch created without an id');
      return { batchId: out.id, reservation };
    } catch (e) {
      await this.budget.release(reservation);
      throw e;
    }
  }

  async batchStatus(id: string): Promise<AiBatchStatus> {
    await this.assertEnabled('qa');
    const apiKey = await this.apiKey();
    const b = (await this.call(
      'GET',
      `/v1/messages/batches/${encodeURIComponent(id)}`,
      apiKey,
      undefined,
      30_000,
    )) as {
      id: string;
      processing_status: AiBatchStatus['status'];
      request_counts?: Record<string, number>;
      results_url?: string | null;
    };
    const c = b.request_counts ?? {};
    return {
      id: b.id,
      status: b.processing_status,
      succeeded: c.succeeded ?? 0,
      errored: c.errored ?? 0,
      expired: c.expired ?? 0,
      canceled: c.canceled ?? 0,
      resultsUrl: b.results_url ?? null,
    };
  }

  /** Reads the finished batch (JSONL, any order, keyed by custom_id). */
  async batchResults<T>(
    id: string,
    model: StaffAiModel,
    schema: AiSchema<T>,
  ): Promise<{ results: AiBatchResult<T>[]; costMillicents: number }> {
    await this.assertEnabled('qa');
    const apiKey = await this.apiKey();
    const text = (await this.call(
      'GET',
      `/v1/messages/batches/${encodeURIComponent(id)}/results`,
      apiKey,
      undefined,
      120_000,
      true,
    )) as string;
    const results: AiBatchResult<T>[] = [];
    let cost = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let row: {
        custom_id?: string;
        result?: {
          type?: string;
          message?: WireMessage;
          error?: { error?: { message?: string } };
        };
      };
      try {
        row = JSON.parse(line) as typeof row;
      } catch {
        continue;
      }
      const customId = row.custom_id;
      if (!customId) continue;
      const r = row.result;
      if (r?.type !== 'succeeded' || !r.message) {
        results.push({ customId, ok: false, error: r?.type ?? 'no result' });
        continue;
      }
      const usage = r.message.usage ?? { input_tokens: 0, output_tokens: 0 };
      cost += costMillicents(model, usage, true);
      try {
        results.push({
          customId,
          ok: true,
          value: this.answer(r.message, schema),
          usage,
        });
      } catch (e) {
        results.push({
          customId,
          ok: false,
          error: e instanceof Error ? e.message : 'bad answer',
          usage,
        });
      }
    }
    return { results, costMillicents: cost };
  }

  /** Settles a batch reservation with the real cost. */
  settleBatch(
    reservation: StaffAiReservation,
    actualMillicents: number,
  ): Promise<void> {
    return this.budget.settle(reservation, actualMillicents);
  }

  // ---------------------------------------------------------------- internals

  private async apiKey(): Promise<string> {
    const key = await this.secrets.field(SECRET_PROVIDER, 'apiKey');
    if (!key) throw new StaffAiNotConfiguredError();
    return key;
  }

  private params<T>(
    model: StaffAiModel,
    system: AiSystemBlock[],
    user: string,
    schema: AiSchema<T>,
    maxTokens: number,
  ): Record<string, unknown> {
    return {
      model,
      max_tokens: maxTokens,
      system: system.map((b) => ({
        type: 'text',
        text: b.text,
        ...(b.cacheTtl
          ? { cache_control: { type: 'ephemeral', ttl: b.cacheTtl } }
          : {}),
      })),
      messages: [{ role: 'user', content: user }],
      // Short, mechanical judgement: no deep reasoning needed or paid for.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: schema.json },
      },
    };
  }

  private answer<T>(wire: WireMessage, schema: AiSchema<T>): T {
    if (wire.stop_reason === 'refusal')
      throw new StaffAiApiError('the model declined');
    if (wire.stop_reason === 'max_tokens')
      throw new StaffAiApiError('the answer was cut off');
    const text = (wire.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new StaffAiSchemaError(`${schema.name}: the answer is not JSON`);
    }
    try {
      return schema.parse(raw);
    } catch (e) {
      throw new StaffAiSchemaError(
        `${schema.name}: ${e instanceof Error ? e.message.slice(0, 200) : 'invalid'}`,
      );
    }
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    apiKey: string,
    body: unknown,
    timeoutMs: number,
    asText = false,
  ): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.http(`${API_BASE}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let detail = '';
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          detail = j.error?.message?.slice(0, 200) ?? '';
        } catch {
          /* no JSON body */
        }
        throw new StaffAiApiError(
          `Claude API HTTP ${res.status} ${detail}`.trim(),
          res.status,
        );
      }
      return asText ? await res.text() : await res.json();
    } catch (e) {
      if (e instanceof StaffAiApiError) throw e;
      if (ctrl.signal.aborted) throw new StaffAiTimeoutError(timeoutMs);
      throw new StaffAiApiError(
        e instanceof Error ? e.message : 'network error',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
