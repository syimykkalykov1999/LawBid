import { spawn } from 'node:child_process';

/**
 * Owner 2026-11-02: frame-by-frame video moderation. Until now a reel was
 * judged by its single cover frame, so a clean cover hid anything unsafe
 * later in the clip.
 *
 * How the big ones do it (Instagram / TikTok / YouTube trust-and-safety
 * pipelines, public engineering talks): they never watch every frame; they
 * sample keyframes spread over the whole clip, run the same image classifier
 * on each, and the worst frame decides. Cost stays bounded by a cap on the
 * number of frames per video and by a daily money cap. We do the same:
 * evenly spaced frames, the existing image pipeline (CSAM hash, Rekognition,
 * cost guard) per frame, stop at the first unsafe frame.
 *
 * The seek happens on the CDN's MP4 over HTTP range requests, so a frame
 * costs a few hundred KB of traffic, not the whole file.
 */

/** Times (seconds) to grab: [count] midpoints of equal slices of the clip,
 * count = one per [everySec] seconds, at least 1, at most [max]. */
export function frameTimesSec(
  durationSec: number,
  everySec: number,
  max: number,
): number[] {
  if (!(durationSec > 0) || !(everySec > 0) || max < 1) return [];
  const count = Math.min(
    Math.floor(max),
    Math.max(1, Math.ceil(durationSec / everySec)),
  );
  const slice = durationSec / count;
  return Array.from(
    { length: count },
    (_, i) => Math.round(slice * (i + 0.5) * 100) / 100,
  );
}

/** ffmpeg is not installed (the binary is missing from the image). */
export class FfmpegMissingError extends Error {
  constructor() {
    super('ffmpeg is not installed');
  }
}

const MAX_FRAME_BYTES = 3_000_000;
const FRAME_TIMEOUT_MS = 30_000;

/** The ffmpeg arguments for one frame; exported for the test. */
export function frameArgs(url: string, atSec: number): string[] {
  return [
    '-v',
    'error',
    '-nostdin',
    // Only what an HTTPS MP4 needs: no file://, no concat, no tcp to
    // anything else, whatever the URL says.
    '-protocol_whitelist',
    'https,tls,tcp,crypto',
    '-rw_timeout',
    '15000000',
    '-ss',
    String(atSec),
    '-i',
    url,
    '-frames:v',
    '1',
    '-vf',
    'scale=min(640\\,iw):-2',
    '-q:v',
    '4',
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    'pipe:1',
  ];
}

/** One JPEG frame at [atSec] of the HTTPS video [url]. Throws
 * [FfmpegMissingError] when there is no binary, Error otherwise. */
export function extractFrame(
  url: string,
  atSec: number,
  bin: string = process.env.FFMPEG_PATH || 'ffmpeg',
): Promise<Buffer> {
  if (!/^https:\/\//i.test(url)) {
    return Promise.reject(new Error('video frame: https url required'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin, frameArgs(url, atSec), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let err = '';
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(() => reject(new Error('video frame: ffmpeg timed out')));
    }, FRAME_TIMEOUT_MS);
    child.stdout.on('data', (b: Buffer) => {
      size += b.length;
      if (size > MAX_FRAME_BYTES) {
        child.kill('SIGKILL');
        done(() => reject(new Error('video frame: too large')));
        return;
      }
      chunks.push(b);
    });
    child.stderr.on('data', (b: Buffer) => {
      if (err.length < 500) err += b.toString();
    });
    child.on('error', (e: NodeJS.ErrnoException) =>
      done(() => reject(e.code === 'ENOENT' ? new FfmpegMissingError() : e)),
    );
    child.on('close', (code) =>
      done(() => {
        if (code === 0 && size > 0) resolve(Buffer.concat(chunks));
        else
          reject(
            new Error(
              `video frame: ffmpeg exit ${code}: ${err.trim().split(url).join('<url>')}`,
            ),
          );
      }),
    );
  });
}
