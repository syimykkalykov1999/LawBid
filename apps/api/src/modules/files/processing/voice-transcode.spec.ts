import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectMime } from '../magic-bytes';
import { FILE_MIME } from '../files.policy';
import {
  FfmpegUnavailableError,
  needsVoiceTranscode,
  transcodeVoiceToM4a,
  voiceTranscodeArgs,
} from './voice-transcode';

/** A real browser-style voice note: Opus in WebM with unknown-size
 * clusters and no duration in the header (what MediaRecorder writes in
 * Firefox / Linux Chrome), 1.5 s, 4 KB. */
const WEBM = readFileSync(
  join(__dirname, '../../../../test/fixtures/sample.webm'),
);

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0;
const withFfmpeg = hasFfmpeg ? it : it.skip;
if (!hasFfmpeg) {
  // The image installs it with WITH_FFMPEG=1 (apps/api/Dockerfile).
  console.warn('voice-transcode.spec: no ffmpeg here, real transcode skipped');
}

const OPTS = { bitrateKbps: 32, sampleRateHz: 16000, timeoutMs: 30_000 };

describe('voice transcode (owner row 146)', () => {
  it('the fixture is a browser voice note the upload pipeline accepts', () => {
    expect(detectMime(WEBM, FILE_MIME.webm)).toBe(FILE_MIME.webm);
  });

  it('only a WebM/Opus chat voice note needs the AAC copy', () => {
    expect(needsVoiceTranscode('chat_voice', FILE_MIME.webm)).toBe(true);
    expect(needsVoiceTranscode('chat_voice', FILE_MIME.m4a)).toBe(false);
    expect(needsVoiceTranscode('chat_attachment', FILE_MIME.webm)).toBe(false);
    expect(needsVoiceTranscode('chat_attachment', FILE_MIME.webmVideo)).toBe(
      false,
    );
  });

  it('arguments: local files only, audio only, no metadata, AAC in M4A', () => {
    const args = voiceTranscodeArgs('/t/in.webm', '/t/out.m4a', OPTS);
    expect(args).toEqual(
      expect.arrayContaining(['-nostdin', '-protocol_whitelist', 'file']),
    );
    expect(args.join(' ')).toContain('-i /t/in.webm');
    expect(args.join(' ')).toContain('-vn -sn -dn -map_metadata -1');
    expect(args.join(' ')).toContain('-c:a aac -b:a 32k -ar 16000 -ac 1');
    expect(args.join(' ')).toContain('-movflags +faststart -f ipod');
    expect(args[args.length - 1]).toBe('/t/out.m4a');
  });

  withFfmpeg(
    'a real WebM/Opus note becomes AAC in M4A that the pipeline reads as audio/mp4',
    async () => {
      const out = await transcodeVoiceToM4a(WEBM, OPTS, FFMPEG);
      expect(out.subarray(4, 11).toString('latin1')).toBe('ftypM4A');
      expect(detectMime(out, FILE_MIME.m4a)).toBe(FILE_MIME.m4a);
      const dir = mkdtempSync(join(tmpdir(), 'voice-spec-'));
      const file = join(dir, 'out.m4a');
      writeFileSync(file, out);
      const probe = spawnSync(
        FFMPEG.replace(/ffmpeg$/, 'ffprobe'),
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,sample_rate,channels:format=duration',
          '-of',
          'json',
          file,
        ],
        { encoding: 'utf8' },
      );
      if (probe.status === 0) {
        const info = JSON.parse(probe.stdout) as {
          streams: {
            codec_name: string;
            sample_rate: string;
            channels: number;
          }[];
          format: { duration: string };
        };
        expect(info.streams).toEqual([
          expect.objectContaining({
            codec_name: 'aac',
            sample_rate: '16000',
            channels: 1,
          }),
        ]);
        expect(Number(info.format.duration)).toBeGreaterThan(1.3);
        expect(Number(info.format.duration)).toBeLessThan(1.7);
      }
    },
  );

  withFfmpeg('garbage input is an error, not an empty copy', async () => {
    await expect(
      transcodeVoiceToM4a(Buffer.from('not audio at all'), OPTS, FFMPEG),
    ).rejects.toThrow(/voice transcode: ffmpeg exited/);
  });

  it('no ffmpeg binary → FfmpegUnavailableError', async () => {
    await expect(
      transcodeVoiceToM4a(WEBM, OPTS, '/nonexistent/ffmpeg'),
    ).rejects.toBeInstanceOf(FfmpegUnavailableError);
  });

  it('a stuck ffmpeg is killed at the admin timeout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-spec-'));
    const bin = join(dir, 'ffmpeg');
    writeFileSync(bin, '#!/bin/sh\nexec sleep 30\n');
    chmodSync(bin, 0o755);
    const started = Date.now();
    await expect(
      transcodeVoiceToM4a(WEBM, { ...OPTS, timeoutMs: 300 }, bin),
    ).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
