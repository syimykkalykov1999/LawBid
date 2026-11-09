/**
 * Owner 2026-11-09 («фото обрабатываются долго»): the server side of one
 * photo publish on the real code path — FilesService.confirm, then the scan
 * job (FileScanProcessor.run with the real ImageProcessor) — against a local
 * MinIO. Prisma, Redis and the virus scanner are in-memory stand-ins (the
 * prod laps put them at ≈10 ms and ≈40 ms).
 *
 * BENCH_R2_LATENCY=1 adds the round trips measured on prod (CloudWatch
 * `files_confirm_slow` / `files_scan_slow`, 09.11 17:29 UTC, 89 KB photo,
 * R2 bucket in WNAM, API in us-east-1) to every storage call, so the total
 * shows what the order of calls costs on prod. BENCH_AVIF=1 turns the AVIF
 * twins on (`images.avif_enabled`).
 *
 * Usage (MinIO from docker-compose, keys from apps/api/.env):
 *   set -a; . apps/api/.env; set +a
 *   node -r ts-node/register/transpile-only apps/api/bench/photo-publish.ts <photo.jpg> [runs]
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ConfigService } from '@nestjs/config';
import type { S3Client } from '@aws-sdk/client-s3';
import type { PinoLogger } from 'nestjs-pino';
import { FilesService } from '../src/modules/files/files.service';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';
import { FileScanProcessor } from '../src/modules/files/jobs/file-scan.processor';
import { ImageProcessor } from '../src/modules/files/processing/image-processor';
import type { VirusScanner } from '../src/modules/files/scanning/virus-scanner';

/** Prod round trips (ms) per S3 command, from the laps above. */
const PROD_MS: Record<string, number> = {
  HeadObjectCommand: 128,
  CopyObjectCommand: 612,
  GetObjectCommand: 250,
  PutObjectCommand: 450,
  DeleteObjectsCommand: 150,
  DeleteObjectCommand: 150,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main(): Promise<void> {
  const photo = readFileSync(process.argv[2]);
  const runs = Number(process.argv[3] ?? 8);
  const latency = process.env.BENCH_R2_LATENCY === '1';
  const avif = process.env.BENCH_AVIF === '1';
  const bucket = process.env.S3_BUCKET_MEDIA ?? 'lawbid-media';

  const config = {
    get: (k: string) => process.env[k],
    getOrThrow: (k: string) => process.env[k] ?? 60,
  } as unknown as ConfigService;
  const quiet = {
    setContext: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    info: () => undefined,
    debug: () => undefined,
  } as unknown as PinoLogger;
  const storage = new S3StorageService(config, quiet);
  const calls: string[] = [];
  const client = (storage as unknown as { client: S3Client }).client;
  client.middlewareStack.add(
    (next, context) => async (args) => {
      const name = context.commandName ?? '?';
      calls.push(name);
      if (latency) await sleep(PROD_MS[name] ?? 150);
      return next(args);
    },
    { step: 'initialize', name: 'benchLatency' },
  );
  if (process.env.BENCH_DEBUG === '1') {
    client.middlewareStack.add(
      (next, context) => async (args) => {
        const t0 = performance.now();
        const out = await next(args);
        const ms = performance.now() - t0;
        if (ms > 50) console.log('slow', context.commandName, Math.round(ms));
        return out;
      },
      { step: 'finalizeRequest', name: 'benchDebug', priority: 'low' },
    );
  }

  const rows = new Map<string, Record<string, unknown>>();
  const redisData = new Map<string, string>();
  const prisma = {
    file: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          scan_status: 'pending',
          deleted_at: null,
          created_at: new Date(),
          width: null,
          height: null,
          blurhash: null,
          ...data,
        };
        rows.set(String(data.id), row);
        return Promise.resolve(row);
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id) ?? null),
      findFirst: () => Promise.resolve(null),
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows.get(where.id);
        if (row) Object.assign(row, data);
        return Promise.resolve({ count: row ? 1 : 0 });
      },
    },
    mediaModerationCheck: { findUnique: () => Promise.resolve(null) },
  };
  const redis = {
    get: (k: string) => Promise.resolve(redisData.get(k) ?? null),
    del: (k: string) => Promise.resolve(Number(redisData.delete(k))),
    zrem: () => Promise.resolve(1),
    zadd: () => Promise.resolve(1),
  };
  const settings = {
    number: (k: string) =>
      Promise.resolve(
        (
          {
            'images.avif_quality': 60,
            'images.avif_effort': 2,
            'images.webp_quality': 88,
            'images.jpeg_quality': 90,
          } as Record<string, number>
        )[k] ?? 50,
      ),
    raw: () => Promise.resolve(undefined),
    boolean: (k: string) =>
      Promise.resolve(k === 'images.avif_enabled' ? avif : false),
    string: (k: string) =>
      Promise.resolve(k === 'storage.image_format' ? 'webp' : ''),
  };
  const files = new FilesService(
    prisma as never,
    redis as never,
    storage,
    settings as never,
    { consume: () => Promise.resolve() } as never,
    {} as never,
    config,
    { enqueueScan: () => Promise.resolve() } as never,
    quiet,
    { isEnabled: () => Promise.resolve(true) } as never,
  );
  const scanner: VirusScanner = {
    name: 'bench',
    scan: () => Promise.resolve({ infected: false }),
  } as unknown as VirusScanner;
  const scan = new FileScanProcessor(
    prisma as never,
    storage,
    new ImageProcessor(),
    scanner,
    quiet,
    settings as never,
  );

  const sha256 = createHash('sha256').update(photo).digest('hex');
  const confirmMs: number[] = [];
  const scanMs: number[] = [];
  const scanCpu: number[] = [];
  let confirmCalls: string[] = [];
  let scanCalls: string[] = [];
  for (let i = 0; i < runs + 1; i++) {
    const fileId = randomUUID();
    const key = `bench/post_image/${fileId}`;
    // The phone's PUT to the presigned link (not timed).
    await storage.put(bucket, key, photo, 'image/jpeg');
    calls.length = 0;
    redisData.set(
      `files:upload:${fileId}`,
      JSON.stringify({
        userId: 'bench',
        purpose: 'post_image',
        mime: 'image/jpeg',
        size: photo.length,
        sha256,
        bucket,
        key,
      }),
    );
    let t = performance.now();
    await files.confirm('bench', fileId);
    const c = performance.now() - t;
    const cc = [...calls];
    calls.length = 0;
    t = performance.now();
    const cpu0 = process.cpuUsage();
    const outcome = await scan.run(fileId, true);
    const cpu = process.cpuUsage(cpu0);
    const s = performance.now() - t;
    const sc = [...calls];
    if (outcome !== 'clean') throw new Error(`scan ended ${outcome}`);
    // The first run warms sharp and the connections; it is not counted.
    if (i > 0) {
      confirmMs.push(c);
      scanMs.push(s);
      scanCpu.push((cpu.user + cpu.system) / 1000);
      confirmCalls = cc;
      scanCalls = sc;
    }
    const row = rows.get(fileId) as { s3_key: string };
    await storage
      .remove(bucket, [
        key,
        row.s3_key,
        `${row.s3_key}_w320`,
        `${row.s3_key}_w1080`,
        `${row.s3_key}.avif`,
        `${row.s3_key}_w320.avif`,
        `${row.s3_key}_w1080.avif`,
      ])
      .catch(() => undefined);
  }
  const count = (xs: string[]) =>
    Object.entries(
      xs.reduce<Record<string, number>>((m, x) => {
        const n = x.replace(/ObjectCommand$|Command$/, '');
        m[n] = (m[n] ?? 0) + 1;
        return m;
      }, {}),
    )
      .map(([k, v]) => `${k}×${v}`)
      .join(' ');
  console.log(
    JSON.stringify({
      photoBytes: photo.length,
      runs,
      r2Latency: latency,
      avif,
      confirmMedianMs: Math.round(median(confirmMs)),
      scanMedianMs: Math.round(median(scanMs)),
      scanCpuMedianMs: Math.round(median(scanCpu)),
      totalMedianMs: Math.round(median(confirmMs) + median(scanMs)),
      confirmCalls: count(confirmCalls),
      scanCalls: count(scanCalls),
      ...(process.env.BENCH_VERBOSE === '1'
        ? { confirmMs: confirmMs.map(Math.round), scanMs: scanMs.map(Math.round) }
        : {}),
    }),
  );
  storage.onModuleDestroy?.();
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
