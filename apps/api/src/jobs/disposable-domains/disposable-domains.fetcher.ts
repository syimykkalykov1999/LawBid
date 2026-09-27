import { Injectable } from '@nestjs/common';

/** Source of the disposable-domain list (plain text). Injectable so tests
 * (and future mirrors, e.g. an S3 copy) replace the network call. */
export interface DisposableDomainsFetcher {
  fetch(url: string): Promise<string>;
}

export const DISPOSABLE_FETCH_TIMEOUT_MS = 30_000;
/** The open list is ~100 KB; anything this large is not that list. */
export const DISPOSABLE_FETCH_MAX_BYTES = 5 * 1024 * 1024;

/** Default fetcher: HTTPS GET with a timeout and a hard body-size cap
 * (streamed, so a huge/never-ending response can't exhaust memory). */
@Injectable()
export class HttpDisposableDomainsFetcher implements DisposableDomainsFetcher {
  async fetch(url: string): Promise<string> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DISPOSABLE_FETCH_TIMEOUT_MS),
      headers: { accept: 'text/plain' },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`disposable list fetch failed: HTTP ${res.status}`);
    }
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > DISPOSABLE_FETCH_MAX_BYTES) {
      throw new Error(`disposable list too large: ${declared} bytes`);
    }
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > DISPOSABLE_FETCH_MAX_BYTES) {
        await reader.cancel();
        throw new Error(`disposable list too large: > ${total} bytes`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }
}
