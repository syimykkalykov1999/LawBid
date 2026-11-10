/** The presigned target of `POST …/uploads` (`upload` in the API answer). */
export interface StorageTarget {
  url: string;
  fields: Record<string, string>;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

/** The storage refused or never took the file (after the retries). */
export class StorageUploadError extends Error {
  readonly status: number | undefined;
  constructor(status: number | undefined, message: string) {
    super(message);
    this.name = 'StorageUploadError';
    this.status = status;
  }
}

export interface SendOptions {
  /** 0…1 of the bytes the browser has sent. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Tries in all (default 4: 1 s, 2 s, 4 s between them). */
  attempts?: number;
  /** Wait before try `failures + 1` in ms (default 1 s, 2 s, 4 s … ≤ 30 s). */
  backoff?: (failures: number) => number;
  /** Test seam: the raw request (default XMLHttpRequest, which reports upload progress). */
  request?: RawRequest;
}

export interface RawResult {
  /** 0 = the request never reached the storage (network, CORS, aborted). */
  status: number;
  retryAfter?: string | null;
}

export type RawRequest = (
  method: 'POST' | 'PUT',
  url: string,
  headers: Record<string, string> | undefined,
  body: Blob | FormData,
  onProgress: ((sent: number, total: number) => void) | undefined,
  signal: AbortSignal | undefined,
) => Promise<RawResult>;

export const DEFAULT_ATTEMPTS = 4;

/** 1 s, 2 s, 4 s … up to 30 s (the app's `outboxBackoff`). */
export function defaultBackoff(failures: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1));
}

/** A lost connection, a timeout or a busy storage is tried again; a refusal
 * (a 4xx such as an expired policy) is not — same rule as the app's
 * `DioStorageTransport`. */
export function isTemporary(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

const abortError = () => new DOMException('Upload cancelled', 'AbortError');

/** XMLHttpRequest: the one browser API with upload progress. */
export const xhrRequest: RawRequest = (method, url, headers, body, onProgress, signal) =>
  new Promise<RawResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, retryAfter: xhr.getResponseHeader('retry-after') });
    xhr.onerror = () => resolve({ status: 0 });
    xhr.ontimeout = () => resolve({ status: 0 });
    xhr.onabort = () => reject(abortError());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });

function retryWait(res: RawResult, failures: number, backoff: (n: number) => number): number {
  const ra = res.retryAfter ? Number(res.retryAfter) : NaN;
  const planned = backoff(failures);
  return Number.isFinite(ra) && ra > 0 ? Math.max(planned, Math.min(60, ra) * 1000) : planned;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });

/** One request with the app's retry rule; resolves on a 2xx, throws
 * `StorageUploadError` otherwise. */
async function sendWithRetry(
  method: 'POST' | 'PUT',
  url: string,
  headers: Record<string, string> | undefined,
  body: () => Blob | FormData,
  opts: SendOptions,
): Promise<void> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const backoff = opts.backoff ?? defaultBackoff;
  const request = opts.request ?? xhrRequest;
  for (let failures = 0; ; failures++) {
    const res = await request(
      method,
      url,
      headers,
      body(),
      opts.onProgress ? (sent, total) => opts.onProgress!(total > 0 ? sent / total : 0) : undefined,
      opts.signal,
    );
    if (res.status >= 200 && res.status < 300) return;
    if (!isTemporary(res.status) || failures + 1 >= attempts) {
      throw new StorageUploadError(
        res.status || undefined,
        res.status === 0
          ? 'Не удалось отправить файл в хранилище (сеть или CORS).'
          : `Хранилище отклонило файл (HTTP ${res.status}).`,
      );
    }
    await sleep(retryWait(res, failures + 1, backoff), opts.signal);
  }
}

/**
 * Sends [file] to the presigned target with progress and retries. Files in
 * Cloudflare R2 answer a presigned PUT (the raw file with exactly the
 * returned headers); AWS answers a presigned POST (the form fields, the file
 * last, S3 POST policy). A fresh body is built per try (a consumed FormData
 * cannot be sent twice).
 */
export function sendToStorage(target: StorageTarget, file: Blob, opts: SendOptions = {}): Promise<void> {
  if (target.method === 'PUT') {
    return sendWithRetry('PUT', target.url, target.headers, () => file, opts);
  }
  return sendWithRetry(
    'POST',
    target.url,
    undefined,
    () => {
      const form = new FormData();
      for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
      form.append('file', file);
      return form;
    },
    opts,
  );
}

/* ----------------------------------------------------------------------- *
 * Resumable upload in parts — the admin's copy of the app's
 * `StorageUploader.putResumable` (apps/mobile/lib/core/uploads/
 * storage_uploader.dart), itself the loop of @aws-sdk/lib-storage
 * (Apache-2.0): the server's `POST /…/multipart` plan gives one link per
 * part still missing, PARTS_AT_ONCE workers pull parts from one shared
 * list, an expired link or a lost connection is fixed by asking for the
 * plan again (only the missing parts go), then `multipart/complete`.
 * ----------------------------------------------------------------------- */

/** The server's `MultipartPlanDto`. */
export interface MultipartPlan {
  partSizeBytes: number;
  partCount: number;
  uploadedParts: number[];
  parts: { partNumber: number; url: string }[];
  expiresAt?: string;
}

export interface ResumableApi {
  /** The plan, or null when the server does not offer parts for this file
   * (flag off, file too small): the caller then sends the whole file. */
  plan(): Promise<MultipartPlan | null>;
  complete(): Promise<void>;
}

/** Files at least this big go in parts (the server's MIN_MULTIPART_BYTES:
 * one 5 MiB part plus a byte since #889; it refuses a plan for less). */
export const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024 + 1;
/** Parts in flight at once (the default `queueSize` of @aws-sdk/lib-storage). */
export const PARTS_AT_ONCE = 4;
const PLAN_ROUNDS = 3;

export interface ResumableOptions extends SendOptions {
  partsAtOnce?: number;
}

/**
 * Returns false when the server does not offer parts (the caller then uses
 * `sendToStorage`); true once every part is in storage and assembled. The
 * caller still confirms the file afterwards, exactly as for one request.
 */
export async function putResumable(file: Blob, api: ResumableApi, opts: ResumableOptions = {}): Promise<boolean> {
  if (file.size < RESUMABLE_THRESHOLD_BYTES) return false;
  let current = await api.plan();
  if (!current) return false;
  for (let round = 0; round < PLAN_ROUNDS && current.parts.length > 0; round++) {
    await putParts(file, current, opts);
    current = (await api.plan()) ?? current;
    if (round === PLAN_ROUNDS - 1 && current.parts.length > 0) {
      throw new StorageUploadError(undefined, 'Хранилище не приняло все части файла. Попробуйте ещё раз.');
    }
  }
  await api.complete();
  return true;
}

async function putParts(file: Blob, plan: MultipartPlan, opts: ResumableOptions): Promise<void> {
  const total = file.size;
  const partSize = plan.partSizeBytes;
  const queue = [...plan.parts];
  const inFlight = new Map<number, number>();
  let finished = plan.uploadedParts.length * partSize;
  const report = () => {
    let moving = 0;
    for (const n of inFlight.values()) moving += n;
    opts.onProgress?.(Math.min(1, (finished + moving) / total));
  };
  // One signal for the workers: the caller's cancel stops them all, and so
  // does the first failure (its error is the one the caller sees).
  const stop = new AbortController();
  const onOuterAbort = () => stop.abort();
  opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
  const partOpts: SendOptions = {
    attempts: opts.attempts,
    backoff: opts.backoff,
    request: opts.request,
    signal: stop.signal,
  };

  async function worker(): Promise<void> {
    for (;;) {
      const part = queue.shift();
      if (!part || stop.signal.aborted) return;
      const start = (part.partNumber - 1) * partSize;
      const end = Math.min(start + partSize, total);
      try {
        await sendWithRetry('PUT', part.url, undefined, () => file.slice(start, end), {
          ...partOpts,
          onProgress: (f) => {
            inFlight.set(part.partNumber, Math.round(f * (end - start)));
            report();
          },
        });
      } catch (e) {
        if (!stop.signal.aborted) stop.abort();
        throw e;
      }
      inFlight.delete(part.partNumber);
      finished += end - start;
      report();
    }
  }

  try {
    const n = Math.min(opts.partsAtOnce ?? PARTS_AT_ONCE, queue.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
  } finally {
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
  if (opts.signal?.aborted) throw abortError();
}
