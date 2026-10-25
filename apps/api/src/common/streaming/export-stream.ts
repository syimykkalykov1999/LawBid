import { createHash, type Hash } from 'node:crypto';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import archiver, { type Archiver } from 'archiver';

/**
 * Owner 2026-10-25 (WP-G, streaming exports): the building blocks every
 * export uses so that no export ever holds a whole file in memory.
 *
 *   rows (paged from the database)  ->  JSON text (one row at a time)
 *   -> archiver ZIP (one entry at a time)  ->  CountingHash (size / time
 *   limits, SHA-256, progress)  ->  S3 multipart upload (@aws-sdk/lib-storage)
 *
 * Peak memory is about one database page plus the upload parts in flight,
 * whatever the export size.
 */

/** Hard stop for one export (bytes written to the archive). */
export const EXPORT_MAX_BYTES_DEFAULT = 2 * 1024 * 1024 * 1024;
/** Hard stop for one export (wall clock). */
export const EXPORT_MAX_MS_DEFAULT = 20 * 60 * 1000;
/** Rows per database round trip. */
export const EXPORT_PAGE_SIZE = 1000;

export class ExportLimitError extends Error {
  constructor(
    readonly kind: 'bytes' | 'time',
    message: string,
  ) {
    super(message);
    this.name = 'ExportLimitError';
  }
}

export interface ExportProgress {
  rows: number;
  bytes: number;
}

/** BigInt friendly JSON replacer (Date has toJSON already). */
export function jsonReplacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v;
}

/**
 * A JSON array as a stream, one element at a time (pretty-printed like the
 * old whole-file `JSON.stringify(rows, null, 2)`, so readers see no change).
 */
export function jsonArrayStream(
  rows: AsyncIterable<unknown> | Iterable<unknown>,
  onRow?: () => void,
): Readable {
  return Readable.from(arrayChunks(rows, '', onRow), { objectMode: false });
}

async function* arrayChunks(
  rows: AsyncIterable<unknown> | Iterable<unknown>,
  indent: string,
  onRow?: () => void,
): AsyncGenerator<string> {
  let first = true;
  yield '[';
  for await (const row of rows) {
    onRow?.();
    const body = JSON.stringify(row, jsonReplacer, 2)
      .split('\n')
      .map((l) => `${indent}  ${l}`)
      .join('\n');
    yield `${first ? '\n' : ',\n'}${body}`;
    first = false;
  }
  yield first ? ']' : `\n${indent}]`;
}

const isIterable = (v: unknown): v is AsyncIterable<unknown> | unknown[] =>
  Array.isArray(v) ||
  (typeof v === 'object' && v !== null && Symbol.asyncIterator in v);

/**
 * A JSON object whose values are streamed arrays (async iterables / arrays)
 * or plain small values: `{ posts: <rows>, cases: <rows> }`.
 */
export function jsonObjectStream(
  parts: Record<string, unknown>,
  onRow?: () => void,
): Readable {
  async function* gen(): AsyncGenerator<string> {
    let first = true;
    yield '{';
    for (const [key, value] of Object.entries(parts)) {
      yield `${first ? '\n' : ',\n'}  ${JSON.stringify(key)}: `;
      first = false;
      if (isIterable(value)) yield* arrayChunks(value, '  ', onRow);
      else yield JSON.stringify(value, jsonReplacer);
    }
    yield first ? '}' : '\n}';
  }
  return Readable.from(gen(), { objectMode: false });
}

/** A single JSON value as a stream (small objects such as profile.json). */
export function jsonValueStream(value: unknown): Readable {
  return Readable.from([JSON.stringify(value, jsonReplacer, 2)], {
    objectMode: false,
  });
}

/**
 * Keyset pagination by `id` (ascending): never OFFSET, so page 500 costs
 * the same as page 1. `fetch(afterId, take)` returns the next page.
 */
export async function* pagedById<T extends { id: string }>(
  fetch: (afterId: string | undefined, take: number) => Promise<T[]>,
  opts: { pageSize?: number; maxRows?: number } = {},
): AsyncGenerator<T> {
  const pageSize = opts.pageSize ?? EXPORT_PAGE_SIZE;
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY;
  let after: string | undefined;
  let seen = 0;
  while (seen < maxRows) {
    const take = Math.min(pageSize, maxRows - seen);
    const page = await fetch(after, take);
    for (const row of page) yield row;
    seen += page.length;
    if (page.length < take) return;
    after = page[page.length - 1].id;
  }
}

/**
 * OFFSET pagination for tables without a single `id` key (composite-key
 * link tables such as likes). Fine for the small sizes these have.
 */
export async function* pagedBySkip<T>(
  fetch: (skip: number, take: number) => Promise<T[]>,
  opts: { pageSize?: number; maxRows?: number } = {},
): AsyncGenerator<T> {
  const pageSize = opts.pageSize ?? EXPORT_PAGE_SIZE;
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY;
  let skip = 0;
  while (skip < maxRows) {
    const take = Math.min(pageSize, maxRows - skip);
    const page = await fetch(skip, take);
    for (const row of page) yield row;
    skip += page.length;
    if (page.length < take) return;
  }
}

/**
 * Pass-through that counts bytes, hashes them, fails the stream when the
 * size or time limit is crossed, and reports progress about every 1 MiB.
 */
export class CountingHash extends Transform {
  bytes = 0;
  private readonly hash: Hash = createHash('sha256');
  private lastReport = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly limits: { maxBytes: number; maxMs: number },
    private readonly onBytes?: (bytes: number) => void,
  ) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: TransformCallback,
  ): void {
    this.bytes += chunk.length;
    if (this.bytes > this.limits.maxBytes) {
      cb(
        new ExportLimitError(
          'bytes',
          `Export is larger than ${Math.round(this.limits.maxBytes / 1048576)} MiB.`,
        ),
      );
      return;
    }
    if (Date.now() - this.startedAt > this.limits.maxMs) {
      cb(
        new ExportLimitError(
          'time',
          `Export took longer than ${Math.round(this.limits.maxMs / 60000)} minutes.`,
        ),
      );
      return;
    }
    this.hash.update(chunk);
    if (this.onBytes && this.bytes - this.lastReport >= 1_048_576) {
      this.lastReport = this.bytes;
      this.onBytes(this.bytes);
    }
    cb(null, chunk);
  }

  digest(): string {
    return this.hash.copy().digest('hex');
  }
}

/**
 * Appends one entry and resolves when the archiver has fully written it, so
 * the next entry (a checksum list, a manifest) can depend on what was
 * streamed before it.
 */
export function appendAndWait(
  archive: Archiver,
  source: Readable | Buffer | string,
  name: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEntry = (e: { name: string }) => {
      if (e.name !== name) return;
      archive.off('entry', onEntry);
      archive.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      archive.off('entry', onEntry);
      reject(err);
    };
    archive.on('entry', onEntry);
    archive.once('error', onError);
    archive.append(source as Readable, { name });
  });
}

/** A pass-through that hashes what flows through it (entry checksums). */
export class HashThrough extends Transform {
  private readonly hash = createHash('sha256');
  override _transform(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: TransformCallback,
  ): void {
    this.hash.update(chunk);
    cb(null, chunk);
  }
  digest(): string {
    return this.hash.copy().digest('hex');
  }
}

export interface ZipExport {
  archive: Archiver;
  /** Pass this as the body of `S3StorageService.putStream`. */
  body: CountingHash;
}

/**
 * An archiver ZIP wired to a CountingHash. `fill` appends the entries
 * (consumed one by one, lazily) and the archive is finalized afterwards;
 * any failure destroys `body`, which makes the multipart upload abort.
 */
export function createZipExport(
  fill: (archive: Archiver) => Promise<void> | void,
  opts: {
    maxBytes?: number;
    maxMs?: number;
    onBytes?: (bytes: number) => void;
    level?: number;
  } = {},
): ZipExport {
  const archive = archiver('zip', { zlib: { level: opts.level ?? 6 } });
  const body = new CountingHash(
    {
      maxBytes: opts.maxBytes ?? EXPORT_MAX_BYTES_DEFAULT,
      maxMs: opts.maxMs ?? EXPORT_MAX_MS_DEFAULT,
    },
    opts.onBytes,
  );
  const fail = (e: unknown) =>
    body.destroy(e instanceof Error ? e : new Error(String(e)));
  archive.on('error', fail);
  body.on('error', () => archive.abort());
  archive.pipe(body);
  void Promise.resolve()
    .then(() => fill(archive))
    .then(() => archive.finalize())
    .catch(fail);
  return { archive, body };
}
