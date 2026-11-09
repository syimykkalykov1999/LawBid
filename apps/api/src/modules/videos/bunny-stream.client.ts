import { CircuitBreaker } from '../../common/resilience/resilience';
import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { BUNNY_TUS_ENDPOINT } from './bunny-signing';
import { assertNotDemo } from '../../common/demo/demo-guards';

export interface BunnyKeys {
  libraryId: string;
  cdnHostname: string;
  apiKey: string;
  tokenAuthKey: string;
  webhookToken: string;
  /** Bunny's Read-Only API key: verifies `X-BunnyStream-Signature`
   * (audit #4). Optional — without it the URL token is the fallback. */
  webhookSigningKey?: string;
  /** Bunny's ACCOUNT API key (api.bunny.net): lets the server register
   * its own webhook URL on the library. Optional. */
  accountApiKey?: string;
}

/** Bunny's video object (only the fields we read). Status: 0 created,
 * 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error,
 * 6 upload failed, 7 JIT segmenting, 8 JIT playlists created. */
export interface BunnyVideo {
  guid: string;
  status: number;
  length: number;
  width: number;
  height: number;
  storageSize: number;
  /** "360p,720p": renditions already encoded and playable (null while
   * none is). */
  availableResolutions?: string | null;
  /** 0–100; 100 when every rendition is encoded. */
  encodeProgress?: number;
}

const API = 'https://video.bunnycdn.com';
const TIMEOUT_MS = 8000;

/** One per process: Bunny failing five calls in a row pauses it a minute. */
const bunnyBreaker = new CircuitBreaker('bunny', {
  threshold: 5,
  openMs: 60_000,
});

/**
 * Owner 2026-10-01 — the few Bunny Stream calls we need. Keys are read on
 * every call (Admin → Integrations), so a changed key works at once.
 * Overridden by a fake in tests.
 */
@Injectable()
export class BunnyStreamClient {
  constructor(
    private readonly secrets: SecretsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Dev only (never in production, see env.schema): the local stand-in
   * for Bunny, tools/fake-bunny.mjs on :4010 — reachable as 10.0.2.2 from
   * the Android emulator. */
  get devFake(): boolean {
    return this.config?.get<boolean>('DEV_FAKE_BUNNY') === true;
  }

  apiBase(): string {
    return this.devFake ? 'http://localhost:4010' : API;
  }

  tusEndpoint(): string {
    return this.devFake
      ? `http://${this.devFakeHost()}/tusupload`
      : BUNNY_TUS_ENDPOINT;
  }

  private devFakeHost(): string {
    return this.config?.get<string>('DEV_FAKE_BUNNY_HOST') ?? '10.0.2.2:4010';
  }

  cdnScheme(): 'https' | 'http' {
    return this.devFake ? 'http' : 'https';
  }

  async keys(): Promise<BunnyKeys | null> {
    if (this.devFake) {
      return {
        libraryId: 'dev',
        cdnHostname: this.devFakeHost(),
        apiKey: 'dev-api-key',
        tokenAuthKey: 'dev-token-key',
        webhookToken: 'dev-webhook',
      };
    }
    const c = await this.secrets.get('bunny_stream');
    const f = c?.fields ?? {};
    if (
      !f.libraryId ||
      !f.cdnHostname ||
      !f.apiKey ||
      !f.tokenAuthKey ||
      !f.webhookToken
    ) {
      return null;
    }
    return {
      libraryId: f.libraryId,
      cdnHostname: f.cdnHostname,
      apiKey: f.apiKey,
      tokenAuthKey: f.tokenAuthKey,
      webhookToken: f.webhookToken,
      ...(f.readOnlyApiKey ? { webhookSigningKey: f.readOnlyApiKey } : {}),
      ...(f.accountApiKey ? { accountApiKey: f.accountApiKey } : {}),
    };
  }

  /** [thumbnailTimeMs]: Bunny takes the cover frame at this moment
   * (owner 2026-10-05: the author picks it). */
  async createVideo(
    title: string,
    thumbnailTimeMs?: number | null,
  ): Promise<string> {
    const k = await this.required();
    const res = await this.call(k, 'POST', `/library/${k.libraryId}/videos`, {
      title: title.slice(0, 100),
      ...(thumbnailTimeMs != null
        ? { thumbnailTime: Math.round(thumbnailTimeMs) }
        : {}),
    });
    const body = (await res.json()) as { guid?: string };
    if (!body.guid) throw new Error('Bunny returned no video id');
    return body.guid;
  }

  async getVideo(guid: string): Promise<BunnyVideo | null> {
    const k = await this.required();
    const res = await this.call(
      k,
      'GET',
      `/library/${k.libraryId}/videos/${guid}`,
      undefined,
      true,
    );
    if (res.status === 404) return null;
    return (await res.json()) as BunnyVideo;
  }

  /** Where Bunny should call us: the public API base (the same
   * CALENDAR_API_BASE_URL the calendar links use) + the token path, which
   * also accepts the signed form. null outside production / the dev fake,
   * so staging never takes over the live library's webhook. */
  ownWebhookUrl(token: string): string | null {
    if (this.devFake || process.env.NODE_ENV !== 'production') return null;
    const base = (
      this.config?.get<string>('CALENDAR_API_BASE_URL')?.trim() ||
      'https://api.lawbid.dev/api/v1'
    ).replace(/\/+$/, '');
    return `${base}/webhooks/bunny/${token}`;
  }

  /**
   * Prod 2026-11-09: Bunny never called us — the library's «Webhook URL»
   * was a manual step in the Bunny dashboard. Bunny's Core API sets it
   * (`POST api.bunny.net/videolibrary/{id}` `{ WebhookUrl }`, account API
   * key, as the usage poll already reads that library). Reads first and
   * writes only when it differs. 'no_account_key' = the owner has to paste
   * the URL by hand (or save the account key).
   */
  async ensureWebhook(
    url: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<'ok' | 'set' | 'no_account_key'> {
    const k = await this.required();
    if (!k.accountApiKey) return 'no_account_key';
    if (!/^\d{1,12}$/.test(k.libraryId)) throw new Error('bad library id');
    const lib = `https://api.bunny.net/videolibrary/${k.libraryId}`;
    const headers = {
      AccessKey: k.accountApiKey,
      accept: 'application/json',
    };
    const call = async (init: RequestInit): Promise<Response> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchFn(lib, { ...init, signal: ctrl.signal });
        if (!res.ok) throw new Error(`Bunny answered HTTP ${res.status}`);
        return res;
      } finally {
        clearTimeout(timer);
      }
    };
    const now = (await (await call({ headers })).json()) as {
      WebhookUrl?: string | null;
    };
    if (now.WebhookUrl === url) return 'ok';
    await call({
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ WebhookUrl: url }),
    });
    return 'set';
  }

  /** Idempotent: an already-gone video is fine. */
  async deleteVideo(guid: string): Promise<void> {
    const k = await this.required();
    await this.call(
      k,
      'DELETE',
      `/library/${k.libraryId}/videos/${guid}`,
      undefined,
      true,
    );
  }

  private async required(): Promise<BunnyKeys> {
    const k = await this.keys();
    if (!k) {
      throw new ServiceUnavailableException({
        code: ErrorCode.VIDEO_UNAVAILABLE,
        message: 'Video is not configured.',
      });
    }
    return k;
  }

  private async call(
    k: BunnyKeys,
    method: string,
    path: string,
    body?: unknown,
    allow404 = false,
  ): Promise<Response> {
    assertNotDemo('Video upload');
    // Owner 2026-10-15: while Bunny keeps failing, calls pause for a minute
    // instead of tying up connections (4xx answers are ours, not an outage).
    return bunnyBreaker.run(
      () => this.callOnce(k, method, path, body, allow404),
      (e) => !/HTTP 4\d\d/.test(e instanceof Error ? e.message : ''),
    );
  }

  private async callOnce(
    k: BunnyKeys,
    method: string,
    path: string,
    body: unknown,
    allow404: boolean,
  ): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.apiBase()}${path}`, {
        method,
        headers: {
          AccessKey: k.apiKey,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok && !(allow404 && res.status === 404)) {
        throw new Error(`Bunny answered HTTP ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
