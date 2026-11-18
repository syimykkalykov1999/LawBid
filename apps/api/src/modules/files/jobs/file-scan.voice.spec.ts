import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../storage/s3-storage.service';
import type { ImageProcessor } from '../processing/image-processor';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import { DevEicarScanner } from '../scanning/virus-scanner';
import {
  FfmpegUnavailableError,
  VoiceTranscoder,
} from '../processing/voice-transcode';
import { voiceM4aKey } from '../files.policy';

/** Owner row 146: a browser voice note (Opus in WebM) gets an AAC/M4A copy
 * next to it before the row turns clean; the original is never touched. */
const WEBM = readFileSync(
  join(__dirname, '../../../../test/fixtures/sample.webm'),
);
const M4A = readFileSync(
  join(__dirname, '../../../../test/fixtures/sample.m4a'),
);
const COPY = Buffer.from('....ftypM4A copy');

function make(opts: {
  data?: Buffer;
  mime?: string;
  purpose?: string;
  settings?: Record<string, unknown>;
  transcode?: jest.Mock;
  putError?: Error;
}) {
  const prisma = {
    file: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'f1',
        owner_user_id: 'u1',
        purpose: opts.purpose ?? 'chat_voice',
        mime: opts.mime ?? 'audio/webm',
        scan_status: 'pending',
        s3_bucket: 'docs',
        s3_key: 'voice/k',
        size_bytes: BigInt((opts.data ?? WEBM).length),
        source_sha256: 'src',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const storage = {
    read: jest.fn().mockResolvedValue(opts.data ?? WEBM),
    remove: jest.fn(),
    put: jest.fn((_b: string, key: string) =>
      opts.putError && key.endsWith('.m4a')
        ? Promise.reject(opts.putError)
        : Promise.resolve(),
    ),
    isPublicStoreBucket: () => false,
  };
  const images = {
    process: jest.fn().mockResolvedValue({
      main: null,
      variants: new Map(),
      width: null,
      height: null,
    }),
  };
  const values: Record<string, unknown> = {
    ...APP_SETTINGS,
    'storage.dedup': false,
    ...opts.settings,
  };
  const settings = {
    boolean: jest.fn((k: string) => Promise.resolve(values[k] === true)),
    number: jest.fn((k: string) => Promise.resolve(Number(values[k]))),
    string: jest.fn((k: string) =>
      Promise.resolve(typeof values[k] === 'string' ? values[k] : ''),
    ),
  };
  const transcode = opts.transcode ?? jest.fn().mockResolvedValue(COPY);
  const transcoder = { toM4a: transcode } as unknown as VoiceTranscoder;
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
  const processor = new FileScanProcessor(
    prisma as unknown as PrismaService,
    storage as unknown as S3StorageService,
    images as unknown as ImageProcessor,
    new DevEicarScanner(),
    logger as unknown as PinoLogger,
    settings as unknown as AppSettingsService,
    undefined,
    undefined,
    undefined,
    transcoder,
  );
  return { processor, prisma, storage, transcode, logger };
}

const cleanUpdate = (prisma: ReturnType<typeof make>['prisma']) =>
  (
    prisma.file.updateMany.mock.calls as unknown as [
      { data: Record<string, unknown> },
    ][]
  ).find(([a]) => a.data.scan_status === 'clean')?.[0].data;

describe('FileScanProcessor: AAC copy of a browser voice note (row 146)', () => {
  it('FO9: a twin with the same bytes but no iPhone copy is not reused — this note gets its copy', async () => {
    const t = make({ settings: { 'storage.dedup': true } });
    t.prisma.file.findFirst.mockResolvedValue({
      id: 'twin',
      s3_key: 'voice/old',
      mime: 'audio/webm',
      size_bytes: BigInt(WEBM.length),
      sha256: 's',
      width: null,
      height: null,
      blurhash: null,
      avif_twins: false,
      voice_m4a: false,
    });
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(t.transcode).toHaveBeenCalled();
    const data = cleanUpdate(t.prisma);
    expect(data).toEqual(expect.objectContaining({ voice_m4a: true }));
    expect(data).not.toHaveProperty('s3_key');
  });

  it('copy key sits next to the original', () => {
    expect(voiceM4aKey('voice/k')).toBe('voice/k.m4a');
  });

  it('WebM/Opus note: the copy is stored next to it BEFORE the row turns clean, original kept', async () => {
    const order: string[] = [];
    const t = make({});
    t.storage.put.mockImplementation((_b: string, key: string) => {
      order.push(`put:${key}`);
      return Promise.resolve();
    });
    t.prisma.file.updateMany.mockImplementation(
      (a: { data: { scan_status?: string } }) => {
        order.push(`update:${a.data.scan_status}`);
        return Promise.resolve({ count: 1 });
      },
    );
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(t.transcode).toHaveBeenCalledWith(WEBM, {
      bitrateKbps: 32,
      sampleRateHz: 16000,
      timeoutMs: 20_000, // the default (R2 review: was 120 s)
    });
    expect(t.storage.put).toHaveBeenCalledWith(
      'docs',
      'voice/k.m4a',
      COPY,
      'audio/mp4',
    );
    expect(order).toEqual(['put:voice/k.m4a', 'update:clean']);
    expect(t.storage.remove).not.toHaveBeenCalled();
    const data = cleanUpdate(t.prisma);
    expect(data).toEqual(expect.objectContaining({ voice_m4a: true }));
    // The row still describes the original WebM object.
    expect(data).not.toHaveProperty('mime');
    expect(data).not.toHaveProperty('s3_key');
  });

  it('uses the admin bitrate, sample rate and timeout', async () => {
    const t = make({
      settings: {
        'media.voice_bitrate_kbps': 48,
        'media.voice_sample_rate_hz': 24000,
        'media.voice_transcode_timeout_sec': 7,
      },
    });
    await t.processor.run('f1', false);
    expect(t.transcode).toHaveBeenCalledWith(WEBM, {
      bitrateKbps: 48,
      sampleRateHz: 24000,
      timeoutMs: 7000,
    });
  });

  it('switch off (media.voice_transcode_enabled): no copy, clean as before', async () => {
    const t = make({ settings: { 'media.voice_transcode_enabled': false } });
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(t.transcode).not.toHaveBeenCalled();
    expect(t.storage.put).not.toHaveBeenCalled();
    expect(cleanUpdate(t.prisma)).toEqual(
      expect.objectContaining({ voice_m4a: false }),
    );
  });

  it('an AAC note from the app (and Safari) is never transcoded', async () => {
    const t = make({ data: M4A, mime: 'audio/mp4' });
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(t.transcode).not.toHaveBeenCalled();
  });

  it('other purposes are never transcoded', async () => {
    const t = make({
      purpose: 'chat_attachment',
      mime: 'application/pdf',
      data: Buffer.from('%PDF-1.4 x'),
    });
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(t.transcode).not.toHaveBeenCalled();
  });

  it('no ffmpeg in the image: the note is still clean (WebM kept), the alert says why', async () => {
    const t = make({
      transcode: jest.fn().mockRejectedValue(new FfmpegUnavailableError()),
    });
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(t.storage.put).not.toHaveBeenCalled();
    expect(cleanUpdate(t.prisma)).toEqual(
      expect.objectContaining({ voice_m4a: false }),
    );
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'voice_transcode_unavailable' }),
      expect.any(String),
    );
  });

  it('a broken note: still clean with its original, no copy, no retry', async () => {
    const t = make({
      transcode: jest.fn().mockRejectedValue(new Error('ffmpeg exited 1')),
    });
    expect(await t.processor.run('f1', false)).toBe('clean');
    expect(cleanUpdate(t.prisma)).toEqual(
      expect.objectContaining({ voice_m4a: false }),
    );
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'voice_transcode_failed' }),
      expect.any(String),
    );
  });

  it('storing the copy fails: retried; on the last attempt clean without the copy', async () => {
    const down = new Error('s3 down');
    await expect(
      make({ putError: down }).processor.run('f1', false),
    ).rejects.toThrow('s3 down');
    const last = make({ putError: down });
    expect(await last.processor.run('f1', true)).toBe('clean');
    expect(cleanUpdate(last.prisma)).toEqual(
      expect.objectContaining({ voice_m4a: false }),
    );
  });
});
