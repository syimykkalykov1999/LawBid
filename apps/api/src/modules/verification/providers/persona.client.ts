import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SecretsService } from '../../../common/secrets/secrets.service';

/**
 * Owner 2026-11-08 («Пусть пока будет ручной; когда подключу ключ — должен
 * работать»): Persona (withpersona.com) identity checks of attorneys. Only
 * Persona's documented REST API is used, no SDK:
 *  - create an inquiry: POST /api/v1/inquiries with
 *    `data.attributes.inquiry-template-id` + `reference-id`
 *    (docs.withpersona.com/docs/tutorial-hosted-flow-unique-api, 2026-11);
 *  - resume one: POST /api/v1/inquiries/{id}/resume → `meta.session-token`
 *    (docs.withpersona.com/docs/resuming-inquiries);
 *  - the hosted flow: https://inquiry.withpersona.com/verify?inquiry-id=…
 *    [&session-token=…] (docs.withpersona.com/docs/hosted-flow);
 *  - webhooks signed with `Persona-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256
 *    of `${t}.${rawBody}` with the webhook secret; several sets while a
 *    secret rotates, any match is authentic
 *    (docs.withpersona.com/docs/webhooks-best-practices).
 * The key, template and webhook secret live on the admin card «Ключи и
 * сервисы → Persona (ID checks)». No key (or the card switched off) = this
 * client reports `null` and verification stays manual, exactly as before.
 */
export const PERSONA_API = 'https://api.withpersona.com/api/v1';
export const PERSONA_HOSTED_FLOW = 'https://inquiry.withpersona.com/verify';
/** Pinned API version (Persona-Version header) the payload shapes follow. */
export const PERSONA_API_VERSION = '2023-01-05';
export const PERSONA_SIGNATURE_HEADER = 'persona-signature';
const TIMEOUT_MS = 8_000;

export interface PersonaConfig {
  apiKey: string;
  templateId: string;
  webhookSecret: string;
}

export interface PersonaInquiryLink {
  inquiryId: string;
  url: string;
}

/** Inquiry statuses that can still be continued in the hosted flow. */
const RESUMABLE = new Set(['created', 'pending']);

@Injectable()
export class PersonaClient {
  constructor(private readonly secrets: SecretsService) {}

  /** The saved, switched-on key set with every field, or null (= manual). */
  async config(): Promise<PersonaConfig | null> {
    const c = await this.secrets.get('persona');
    const apiKey = c?.fields.apiKey ?? '';
    const templateId = c?.fields.templateId ?? '';
    const webhookSecret = c?.fields.webhookSecret ?? '';
    if (!apiKey || !templateId || !webhookSecret) return null;
    return { apiKey, templateId, webhookSecret };
  }

  /** A new inquiry for [referenceId] (our verification request id). */
  async createInquiry(
    cfg: PersonaConfig,
    referenceId: string,
  ): Promise<PersonaInquiryLink> {
    const body = await this.call(cfg, 'POST', '/inquiries', {
      data: {
        attributes: {
          'inquiry-template-id': cfg.templateId,
          'reference-id': referenceId,
        },
      },
    });
    const id = inquiryIdOf(body);
    return { inquiryId: id, url: hostedFlowUrl(id) };
  }

  /**
   * The hosted-flow link of an inquiry already created for this request:
   * a still open one gets a fresh session token; null when it can no
   * longer be continued (completed, expired, failed…) — the caller then
   * creates a new one.
   */
  async resumeInquiry(
    cfg: PersonaConfig,
    inquiryId: string,
  ): Promise<PersonaInquiryLink | null> {
    const current = await this.call(
      cfg,
      'GET',
      `/inquiries/${encodeURIComponent(inquiryId)}`,
    );
    const status = attr(current, 'status');
    if (!RESUMABLE.has(status)) return null;
    const resumed = await this.call(
      cfg,
      'POST',
      `/inquiries/${encodeURIComponent(inquiryId)}/resume`,
    );
    const meta = (resumed as { meta?: Record<string, unknown> }).meta;
    const token = meta?.['session-token'];
    return {
      inquiryId,
      url: hostedFlowUrl(
        inquiryId,
        typeof token === 'string' ? token : undefined,
      ),
    };
  }

  private async call(
    cfg: PersonaConfig,
    method: 'GET' | 'POST',
    path: string,
    json?: unknown,
  ): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${PERSONA_API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'persona-version': PERSONA_API_VERSION,
        },
        body: json === undefined ? undefined : JSON.stringify(json),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Persona answered HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function hostedFlowUrl(inquiryId: string, sessionToken?: string) {
  const u = new URL(PERSONA_HOSTED_FLOW);
  u.searchParams.set('inquiry-id', inquiryId);
  if (sessionToken) u.searchParams.set('session-token', sessionToken);
  return u.toString();
}

/** Staff link to the inquiry in the Persona dashboard (shown in the admin). */
export function dashboardUrl(inquiryId: string): string {
  return `https://app.withpersona.com/dashboard/inquiries/${encodeURIComponent(inquiryId)}`;
}

function inquiryIdOf(body: unknown): string {
  const id = (body as { data?: { id?: unknown } }).data?.id;
  if (typeof id !== 'string' || !/^inq_[A-Za-z0-9]+$/.test(id)) {
    throw new Error('Persona answered without an inquiry id');
  }
  return id;
}

function attr(body: unknown, name: string): string {
  const v = (body as { data?: { attributes?: Record<string, unknown> } }).data
    ?.attributes?.[name];
  return typeof v === 'string' ? v : '';
}

/**
 * Constant-time check of a `Persona-Signature` header against the raw
 * body: every `t=…,v1=…` set is tried (secret rotation sends one per
 * secret) and any match is authentic.
 */
export function personaSignatureValid(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  for (const set of header.trim().split(/\s+/)) {
    const parts = new Map<string, string>();
    for (const kv of set.split(',')) {
      const i = kv.indexOf('=');
      if (i > 0) parts.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
    const t = parts.get('t') ?? '';
    const v1 = parts.get('v1') ?? '';
    if (!/^\d{1,12}$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) continue;
    const expected = createHmac('sha256', secret)
      .update(`${t}.`)
      .update(rawBody)
      .digest();
    const got = Buffer.from(v1.toLowerCase(), 'hex');
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      return true;
    }
  }
  return false;
}
