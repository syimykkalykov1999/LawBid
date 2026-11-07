import { randomUUID } from 'node:crypto';
import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createR2Client, presignR2Put, webOriginOf } from './r2-client';

const STEP_TIMEOUT_MS = 8_000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const BODY = 'lawbid r2 self-test';

/** A small object kept in the bucket: the health probe and
 * scripts/ops/verify-r2-media.sh look at it. */
export const R2_PROBE_KEY = 'ops/health-probe';

function timed(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(STEP_TIMEOUT_MS) };
}

async function step<T>(explain: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new Error(
      `${explain} (${e instanceof Error ? e.message : String(e)})`,
      { cause: e },
    );
  }
}

async function putBySignedLink(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<void> {
  const url = await presignR2Put(client, {
    bucket,
    key,
    contentType: 'text/plain',
    size: Buffer.byteLength(BODY),
    cacheControl: IMMUTABLE,
    expiresSec: 60,
  });
  const res = await fetch(
    url,
    timed({
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': IMMUTABLE },
      body: BODY,
    }),
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** The browser's question before a PUT, on the host the links point at. */
async function checkCors(
  client: S3Client,
  bucket: string,
  origin: string,
): Promise<void> {
  const signed = await presignR2Put(client, {
    bucket,
    key: 'ops/cors-check',
    contentType: 'text/plain',
    size: 1,
    cacheControl: IMMUTABLE,
    expiresSec: 60,
  });
  const res = await fetch(
    signed,
    timed({
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,cache-control',
      },
    }),
  );
  const allowed = res.headers.get('access-control-allow-origin');
  if (allowed !== origin && allowed !== '*') {
    throw new Error(`HTTP ${res.status}, адрес ${origin} не разрешён`);
  }
}

/**
 * Admin → Integrations → «Проверить» for Cloudflare R2: everything the
 * uploads will do, on the real bucket, step by step. The first step that
 * fails says what to fix. The switch is not touched.
 */
export async function r2SelfTest(f: Record<string, string>): Promise<void> {
  const client = createR2Client({
    accountId: f.accountId,
    accessKeyId: f.accessKeyId,
    secretAccessKey: f.secretAccessKey,
  });
  const base = f.publicBaseUrl.replace(/\/+$/, '');
  const webOrigin = webOriginOf(base);
  const key = `ops/self-test-${randomUUID()}`;
  try {
    await step('R2 не принял ключи или нет бакета', () =>
      client.send(new HeadBucketCommand({ Bucket: f.bucket }), {
        abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      }),
    );
    await step('Запись в бакет по подписанной ссылке не прошла', () =>
      putBySignedLink(client, f.bucket, key),
    );
    await step(
      'Файл не открывается по публичному адресу: подключите свой домен к бакету и дождитесь статуса Active',
      async () => {
        const res = await fetch(`${base}/${key}`, timed({ method: 'HEAD' }));
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      },
    );
    await step('Удаление из бакета не прошло', () =>
      client.send(
        new DeleteObjectsCommand({
          Bucket: f.bucket,
          Delete: { Objects: [{ Key: key }], Quiet: true },
        }),
        { abortSignal: AbortSignal.timeout(STEP_TIMEOUT_MS) },
      ),
    );
    await step('Не удалось записать проверочный файл', () =>
      putBySignedLink(client, f.bucket, R2_PROBE_KEY),
    );
    if (webOrigin) {
      await step('В бакете не настроен CORS', () =>
        checkCors(client, f.bucket, webOrigin),
      );
    }
  } finally {
    client.destroy();
  }
}
