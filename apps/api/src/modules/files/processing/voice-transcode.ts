import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { FILE_MIME } from '../files.policy';

/**
 * Owner row 146: a voice note recorded on the website in Firefox or in
 * Chrome on Linux is Opus in WebM (MediaRecorder has no AAC encoder there,
 * and the browser-side AAC step of rows 101/102 is skipped). The iPhone
 * (AVPlayer) cannot play WebM, so the scan worker writes an AAC copy in an
 * MPEG-4 audio (.m4a) container next to the original — the format the app
 * itself records. The original is never replaced: clients that play WebM
 * keep getting it, the copy is an extra object (`<key>.m4a`).
 *
 * The tool: the `ffmpeg` program the image already carries for the video
 * frame check (apps/api/Dockerfile, `WITH_FFMPEG=1`, Alpine package). It is
 * started as a separate process with files in a private temp folder; no
 * ffmpeg code is copied or linked. The AAC encoder used is ffmpeg's own
 * (`-c:a aac`), not libfdk.
 */

/** ffmpeg is not installed (the image was built without WITH_FFMPEG=1). */
export class FfmpegUnavailableError extends Error {
  constructor() {
    super('voice transcode: ffmpeg is not installed');
  }
}

export interface VoiceTranscodeOptions {
  /** `media.voice_bitrate_kbps` — the same AAC bitrate the app records. */
  bitrateKbps: number;
  /** `media.voice_sample_rate_hz` — the same sample rate the app records. */
  sampleRateHz: number;
  /** `media.voice_transcode_timeout_sec` × 1000. */
  timeoutMs: number;
}

/** Only a browser voice note (Opus in WebM) needs the AAC copy. */
export function needsVoiceTranscode(purpose: string, mime: string): boolean {
  return purpose === 'chat_voice' && mime === FILE_MIME.webm;
}

/** The ffmpeg arguments; exported for the test. */
export function voiceTranscodeArgs(
  input: string,
  output: string,
  o: VoiceTranscodeOptions,
): string[] {
  return [
    '-v',
    'error',
    '-nostdin',
    // Local files only, whatever the container says inside.
    '-protocol_whitelist',
    'file',
    '-i',
    input,
    // Audio only: no picture, subtitles, data or metadata (no tags of the
    // recording browser end up in the copy).
    '-vn',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-c:a',
    'aac',
    '-b:a',
    `${Math.round(o.bitrateKbps)}k`,
    '-ar',
    String(Math.round(o.sampleRateHz)),
    '-ac',
    '1',
    // The index at the front: AVPlayer starts playing before the end has
    // arrived. `ipod` = the .m4a flavour of MP4 (brand M4A).
    '-movflags',
    '+faststart',
    '-f',
    'ipod',
    '-y',
    output,
  ];
}

/** AAC/M4A bytes of the WebM/Opus [data]. Throws [FfmpegUnavailableError]
 * when there is no binary, Error otherwise (bad input, timeout). */
export async function transcodeVoiceToM4a(
  data: Buffer,
  o: VoiceTranscodeOptions,
  bin: string = process.env.FFMPEG_PATH || 'ffmpeg',
): Promise<Buffer> {
  // /tmp is the task's writable volume (readonlyRootFilesystem on ECS).
  const dir = await mkdtemp(join(tmpdir(), 'voice-'));
  try {
    const input = join(dir, 'in.webm');
    const output = join(dir, 'out.m4a');
    await writeFile(input, data);
    await run(bin, voiceTranscodeArgs(input, output, o), o.timeoutMs);
    const out = await readFile(output);
    if (out.length === 0) throw new Error('voice transcode: empty output');
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
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
      done(() => reject(new Error('voice transcode: ffmpeg timed out')));
    }, timeoutMs);
    child.stderr.on('data', (b: Buffer) => {
      if (err.length < 500) err += b.toString();
    });
    child.on('error', (e: NodeJS.ErrnoException) =>
      done(() =>
        reject(e.code === 'ENOENT' ? new FfmpegUnavailableError() : e),
      ),
    );
    child.on('close', (code) =>
      done(() =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `voice transcode: ffmpeg exited ${code}: ${err.trim().slice(0, 300)}`,
              ),
            ),
      ),
    );
  });
}

/** Injectable seam for the scan worker (and its tests). */
@Injectable()
export class VoiceTranscoder {
  toM4a(data: Buffer, o: VoiceTranscodeOptions): Promise<Buffer> {
    return transcodeVoiceToM4a(data, o);
  }
}
