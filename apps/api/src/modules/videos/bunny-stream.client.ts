import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';

export interface BunnyKeys {
  libraryId: string;
  cdnHostname: string;
  apiKey: string;
  tokenAuthKey: string;
  webhookToken: string;
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
}

const API = 'https://video.bunnycdn.com';
const TIMEOUT_MS = 8000;

/**
 * Owner 2026-10-01 — the few Bunny Stream calls we need. Keys are read on
 * every call (Admin → Integrations), so a changed key works at once.
 * Overridden by a fake in tests.
 */
@Injectable()
export class BunnyStreamClient {
  constructor(private readonly secrets: SecretsService) {}

  async keys(): Promise<BunnyKeys | null> {
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
    };
  }

  async createVideo(title: string): Promise<string> {
    const k = await this.required();
    const res = await this.call(k, 'POST', `/library/${k.libraryId}/videos`, {
      title: title.slice(0, 100),
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API}${path}`, {
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
