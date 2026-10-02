import { createHash } from 'node:crypto';

/**
 * Owner 2026-10-01 — Bunny Stream signing helpers (pure, unit-tested).
 *
 * - TUS uploads: `AuthorizationSignature = sha256(libraryId + apiKey +
 *   expire + videoId)` (hex), so the phone uploads straight to Bunny and
 *   never sees the library key.
 * - Playback: CDN token authentication with a *directory* token
 *   (`token_path=/{guid}/`) in the path form, so every HLS segment the
 *   playlist references inherits the token.
 */
export const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

export function tusSignature(
  libraryId: string,
  apiKey: string,
  expire: number,
  videoId: string,
): string {
  return createHash('sha256')
    .update(`${libraryId}${apiKey}${expire}${videoId}`)
    .digest('hex');
}

/** Rounds up to the next full hour so signed URLs stay CDN-cacheable. */
export function roundedExpiry(nowMs: number, ttlSec: number): number {
  const at = Math.floor(nowMs / 1000) + ttlSec;
  return Math.ceil(at / 3600) * 3600;
}

/** A signed `https://{host}/bcdn_token=…/{guid}/{file}` URL. */
export function signedCdnUrl(
  host: string,
  tokenKey: string,
  guid: string,
  file: string,
  expires: number,
): string {
  const dir = `/${guid}/`;
  const parameterData = `token_path=${dir}`;
  const token = createHash('sha256')
    .update(`${tokenKey}${dir}${expires}${parameterData}`)
    .digest('base64')
    .replace(/\n/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return (
    `https://${host}/bcdn_token=${token}` +
    `&token_path=${encodeURIComponent(dir)}&expires=${expires}${dir}${file}`
  );
}
