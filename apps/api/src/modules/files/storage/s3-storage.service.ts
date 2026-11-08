import {
  Inject,
  Injectable,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { createHash } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as cloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { Readable } from 'node:stream';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { BucketKind } from '../files.policy';
import {
  createR2Client,
  presignR2Put,
  webOriginOf,
} from '../../../common/secrets/r2-client';
import { checkR2, R2_NOT_READY_TEXT, type R2NotReady } from './r2-readiness';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { CdnInvalidationQueue, type CdnTarget } from './cdn-invalidation';

/** S3 multipart parts are 5 MiB at least (except the last). */
const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

/**
 * Owner 2026-10-22 (client economy plan, package I): every object key is
 * unique (a file id / content hash — a changed file is a new key), so the
 * bytes behind a key never change. Browsers, the Flutter web build and
 * CloudFront may therefore keep them for a year; the header is written on
 * the object (uploads) and asked for on signed reads.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Owner 2026-10-25 (caching round 2, S2-10): PRIVATE files (the documents
 * bucket: chat media, case files, documents) are never `public`. A deleted
 * confidential file must not stay downloadable from a shared cache; the
 * phone keeps the bytes by the unsigned path, so nothing is lost for the
 * app. Public media keeps the year-long immutable header above.
 */
export const PRIVATE_CACHE_CONTROL = 'private, max-age=3600';

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
  /** Owner 2026-10-24 (R2): absent / POST = multipart form with [fields];
   * PUT = the raw file body with exactly [headers] (R2 has no POST policy). */
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

/**
 * Owner 2026-10-24: Cloudflare R2 for PUBLIC media only (avatars, post and
 * review photos, stickers). R2 has no egress fee. Private content (the
 * documents bucket) never reaches R2: see docs/architecture/R2_PUBLIC_MEDIA.md.
 */
export interface PublicStore {
  client: S3Client;
  bucket: string;
  /** https origin of the public custom domain, no trailing slash. */
  publicBaseUrl: string;
  zoneId?: string;
  purgeToken?: string;
}

/** Plain-text values the admin keeps in the `cloudflare_r2` integration. */
export type R2Fields = Record<string, string | undefined>;

/**
 * Owner 2026-10-22 (systems checklist §22): private media (the documents
 * bucket — chat photos/voice/files, case files, documents) is served
 * through a CloudFront distribution with a trusted key group. The API
 * signs each link with the private key; CloudFront checks the signature
 * and reads S3 through OAC. Without the three values the links stay
 * presigned S3 GETs (same shape for the app: an https URL that expires).
 */
export interface PrivateCdn {
  domain: string;
  keyPairId: string;
  privateKey: string;
}

/** How long one live look at R2 is trusted. */
const R2_READY_TTL_MS = 60_000;
const R2_NOT_READY_TTL_MS = 30_000;

/** What the admin sees about the `media.public_store` switch. */
export interface R2Status {
  selected: boolean;
  /** New public media really goes to R2. */
  active: boolean;
  /** Selected but held on AWS: why, in plain words. */
  fallback: string | null;
}

export interface ObjectHead {
  size: number;
  contentType?: string;
}

/**
 * Thin S3 wrapper (AWS S3 in staging/prod with the task's IAM role; local
 * MinIO when S3_ENDPOINT is set — docs/KEYS_SETUP.md #15). Both buckets are
 * private: nothing here ever sets an ACL or bucket policy, every read goes
 * through a short-lived signature (docs/02 §1.6, docs/03 §2.2).
 */
@Injectable()
export class S3StorageService implements OnModuleDestroy {
  private client?: S3Client;
  private buckets?: Record<BucketKind, string>;
  private privateCdn?: PrivateCdn;
  private fingerprint = '';
  /** R2 (public media). Configured whenever its keys exist, so objects
   * already stored there stay readable even after a rollback to AWS. */
  private publicStore?: PublicStore;
  private r2Fingerprint = '';
  /** `media.public_store` = 'r2' (cached; refreshed on every operation). */
  private r2Selected = false;
  /** The last live look at R2 (none yet = not proven = AWS). */
  private r2Check?: { at: number; notReady: R2NotReady | null };
  private r2CheckRunning?: Promise<void>;
  private readonly invalidations?: CdnInvalidationQueue;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
    // Queue of CDN invalidation paths (S2-1); absent in tests/dev.
    @Optional() @Inject(REDIS_CLIENT) redis?: Redis,
  ) {
    this.logger.setContext(S3StorageService.name);
    this.invalidations = redis ? new CdnInvalidationQueue(redis) : undefined;
    this.build({
      region: config.get<string>('S3_REGION'),
      bucketDocuments: config.get<string>('S3_BUCKET_DOCUMENTS'),
      bucketMedia: config.get<string>('S3_BUCKET_MEDIA'),
      accessKeyId: config.get<string>('S3_ACCESS_KEY_ID'),
      secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY'),
      ...this.envPrivateCdn(),
    });
    this.fingerprint = 'env';
  }

  private envPrivateCdn(): Record<string, string | undefined> {
    return {
      privateCdnDomain: this.config.get<string>('CLOUDFRONT_PRIVATE_DOMAIN'),
      privateCdnKeyId: this.config.get<string>('CLOUDFRONT_PRIVATE_KEY_ID'),
      privateCdnPrivateKey: this.config.get<string>(
        'CLOUDFRONT_PRIVATE_KEY_PEM',
      ),
    };
  }

  private build(f: Record<string, string | undefined>): void {
    const documents = f.bucketDocuments;
    const media = f.bucketMedia;
    this.client?.destroy();
    this.client = undefined;
    this.buckets = undefined;
    this.privateCdn = undefined;
    if (!documents || !media) return;
    const domain = f.privateCdnDomain?.trim().toLowerCase();
    const keyPairId = f.privateCdnKeyId?.trim();
    const privateKey = f.privateCdnPrivateKey?.replace(/\\n/g, '\n').trim();
    if (domain && keyPairId && privateKey) {
      this.privateCdn = { domain, keyPairId, privateKey };
    } else if (domain || keyPairId || privateKey) {
      this.logger.warn(
        'CloudFront private media needs domain, key id and private key together; using presigned S3 links',
      );
    }
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.buckets = { documents, media };
    this.client = new S3Client({
      region: f.region ?? 'us-east-1',
      endpoint,
      // MinIO serves buckets by path, not by virtual-host subdomain.
      forcePathStyle: endpoint !== undefined,
      credentials:
        f.accessKeyId && f.secretAccessKey
          ? { accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey }
          : undefined,
    });
  }

  /**
   * Owner 2026-10-01: the storage keys can be changed in Admin →
   * Integrations; the client is rebuilt only when they changed.
   */
  private async refresh(): Promise<void> {
    await this.refreshPublicStore();
    const c = await this.secrets?.get('storage');
    if (c?.source === 'db') {
      if (c.fingerprint !== this.fingerprint) {
        this.build(c.fields);
        this.fingerprint = c.fingerprint;
      }
    } else if (this.fingerprint !== 'env') {
      this.build({
        region: this.config.get<string>('S3_REGION'),
        bucketDocuments: this.config.get<string>('S3_BUCKET_DOCUMENTS'),
        bucketMedia: this.config.get<string>('S3_BUCKET_MEDIA'),
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY'),
        ...this.envPrivateCdn(),
      });
      this.fingerprint = 'env';
    }
  }

  /**
   * Loads the R2 keys (Admin → Integrations → Cloudflare R2) and the
   * `media.public_store` switch. A broken or missing R2 setup simply means
   * "AWS": the switch can never take the app down.
   */
  private async refreshPublicStore(): Promise<void> {
    const c = await this.secrets?.get('cloudflare_r2');
    const fp = c?.fingerprint ?? '';
    if (fp !== this.r2Fingerprint) {
      this.publicStore?.client.destroy();
      this.publicStore = c ? this.buildPublicStore(c.fields) : undefined;
      this.r2Fingerprint = fp;
      this.r2Check = undefined;
    }
    try {
      this.r2Selected =
        (await this.settings?.string('media.public_store')) === 'r2';
    } catch {
      this.r2Selected = false;
    }
  }

  /** Owner 2026-11-04: R2 takes new files only after a recent live look said
   * it works. Until then the switch changes nothing and uploads keep going
   * to AWS, whatever was typed in the admin. */
  private get r2Proven(): boolean {
    return (
      this.r2Selected &&
      this.publicStore !== undefined &&
      this.r2Check?.notReady === null
    );
  }

  /** Looks at a selected R2 again when the last look is old. One look at a
   * time; it is bounded by short timeouts. Never throws. */
  private async ensureR2Checked(): Promise<void> {
    const store = this.publicStore;
    if (!this.r2Selected || !store) return;
    const last = this.r2Check;
    const ttl = last?.notReady ? R2_NOT_READY_TTL_MS : R2_READY_TTL_MS;
    if (last && Date.now() - last.at < ttl) return;
    this.r2CheckRunning ??= checkR2({
      client: store.client,
      bucket: store.bucket,
      publicBaseUrl: store.publicBaseUrl,
      webOrigin: webOriginOf(store.publicBaseUrl),
    })
      .then((notReady) => {
        if (notReady && last?.notReady !== notReady) {
          this.logger.warn(
            { alert: 'r2_fallback_to_aws', notReady },
            'R2 is selected but not ready: new public media stays on AWS',
          );
        }
        this.r2Check = { at: Date.now(), notReady };
      })
      .finally(() => {
        this.r2CheckRunning = undefined;
      });
    await this.r2CheckRunning;
  }

  /** For the admin: the switch and what it really does right now. */
  async r2Status(): Promise<R2Status> {
    await this.refresh();
    const selected = this.r2Selected;
    if (!selected) return { selected, active: false, fallback: null };
    if (!this.publicStore) {
      return { selected, active: false, fallback: R2_NOT_READY_TEXT.no_keys };
    }
    await this.ensureR2Checked();
    const notReady = this.r2Check?.notReady;
    return {
      selected,
      active: this.r2Proven,
      fallback: notReady ? R2_NOT_READY_TEXT[notReady] : null,
    };
  }

  private buildPublicStore(f: R2Fields): PublicStore | undefined {
    const accountId = f.accountId?.trim();
    const bucket = f.bucket?.trim();
    const accessKeyId = f.accessKeyId?.trim();
    const secretAccessKey = f.secretAccessKey?.trim();
    const base = f.publicBaseUrl?.trim().replace(/\/+$/, '');
    if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !base) {
      return undefined;
    }
    // The routing is by bucket name: an R2 bucket named like an AWS one
    // would make private objects look public. Refuse such a setup.
    if (
      this.buckets &&
      (bucket === this.buckets.documents || bucket === this.buckets.media)
    ) {
      this.logger.warn(
        'The R2 bucket has the same name as an AWS bucket; R2 is ignored',
      );
      return undefined;
    }
    return {
      client: createR2Client({ accountId, accessKeyId, secretAccessKey }),
      bucket,
      publicBaseUrl: base,
      zoneId: f.zoneId?.trim() || undefined,
      purgeToken: f.purgeToken?.trim() || undefined,
    };
  }

  /** Name of the R2 bucket when R2 has keys (loads them first), else null. */
  async publicStoreBucket(): Promise<string | null> {
    await this.refresh();
    return this.publicStore?.bucket ?? null;
  }

  /**
   * Owner 2026-10-24: bucket size and object count of R2, by listing it
   * (ListObjectsV2: 1000 keys a call, Class A, $4.50 per million calls: a
   * million objects cost one cent). Run once a day, never per request.
   * Null when R2 has no keys; `truncated` when [maxPages] ended the walk.
   */
  async publicStoreUsage(
    maxPages = 2_000,
  ): Promise<{ bytes: number; objects: number; truncated: boolean } | null> {
    await this.refresh();
    const store = this.publicStore;
    if (!store) return null;
    let bytes = 0;
    let objects = 0;
    let token: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await store.client.send(
        new ListObjectsV2Command({
          Bucket: store.bucket,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const o of res.Contents ?? []) {
        bytes += Number(o.Size ?? 0);
        objects++;
      }
      if (!res.IsTruncated || !res.NextContinuationToken) {
        return { bytes, objects, truncated: false };
      }
      token = res.NextContinuationToken;
    }
    return { bytes, objects, truncated: true };
  }

  /** True when [bucket] is the R2 bucket (public media only). */
  isPublicStoreBucket(bucket: string): boolean {
    return (
      this.publicStore !== undefined &&
      bucket === this.publicStore.bucket &&
      // An AWS bucket name is never treated as R2, whatever is configured.
      bucket !== this.buckets?.documents &&
      bucket !== this.buckets?.media
    );
  }

  /** New public media goes to R2 now (switch on and R2 proven to work). */
  get publicStoreActive(): boolean {
    return this.r2Proven;
  }

  /** True when storage keys are present (loads them first). */
  async ready(): Promise<boolean> {
    await this.refresh();
    return this.configured;
  }

  get configured(): boolean {
    return this.client !== undefined;
  }

  /**
   * The bucket new objects of [kind] go to. `documents` (everything
   * private) is ALWAYS the AWS documents bucket: there is no code path
   * from a private kind to R2. `media` (public) is R2 only when the
   * switch is on and a recent live look proved R2 works. Call
   * [resolveBucket] when the switch may not have been read yet.
   */
  bucket(kind: BucketKind): string {
    const { buckets } = this.require();
    if (
      kind === 'media' &&
      this.publicStore &&
      this.r2Proven &&
      this.isPublicStoreBucket(this.publicStore.bucket)
    ) {
      return this.publicStore.bucket;
    }
    return buckets[kind];
  }

  /** [bucket] after loading the keys, the switch and R2's health. */
  async resolveBucket(kind: BucketKind): Promise<string> {
    await this.refresh();
    if (kind === 'media') await this.ensureR2Checked();
    return this.bucket(kind);
  }

  /** The AWS bucket of [kind], whatever the switch says (older apps that
   * cannot do a presigned PUT keep uploading public media to AWS). */
  awsBucket(kind: BucketKind): string {
    return this.require().buckets[kind];
  }

  /** `Cache-Control` of objects in [bucket]: private for the documents
   * bucket, immutable-public for public media. */
  cacheControlFor(bucket: string): string {
    return this.buckets && bucket === this.buckets.documents
      ? PRIVATE_CACHE_CONTROL
      : IMMUTABLE_CACHE_CONTROL;
  }

  /** The client that owns [bucket]: R2 for its own bucket, AWS otherwise. */
  private clientFor(bucket: string): S3Client {
    if (this.publicStore && this.isPublicStoreBucket(bucket)) {
      return this.publicStore.client;
    }
    return this.require().client;
  }

  /** Browser-style POST policy: the object can only be written at [key],
   * with exactly [size] bytes and exactly [contentType] — S3 rejects any
   * other upload before it is stored. */
  async presignPost(input: {
    bucket: string;
    key: string;
    contentType: string;
    size: number;
    expiresSec: number;
  }): Promise<PresignedPost> {
    await this.refresh();
    const { client } = this.require();
    const { url, fields } = await createPresignedPost(client, {
      Bucket: input.bucket,
      Key: input.key,
      Conditions: [
        ['content-length-range', input.size, input.size],
        ['eq', '$Content-Type', input.contentType],
      ],
      // The app forwards every field as-is, so the object is stored with
      // the immutable Cache-Control (package I).
      Fields: {
        'Content-Type': input.contentType,
        'Cache-Control': this.cacheControlFor(input.bucket),
      },
      Expires: input.expiresSec,
    });
    return { url, fields };
  }

  /**
   * R2 has no presigned POST. A presigned PUT of exactly [size] bytes: the
   * signature covers Content-Type, Content-Length and Cache-Control, so
   * the app must send those headers as returned. The size is checked again
   * after the upload (HeadObject at confirm), which is the authoritative
   * limit. Refuses every bucket except the R2 one.
   */
  async presignPut(input: {
    bucket: string;
    key: string;
    contentType: string;
    size: number;
    expiresSec: number;
  }): Promise<PresignedPost> {
    await this.refresh();
    if (!this.isPublicStoreBucket(input.bucket) || !this.publicStore) {
      throw new Error('presignPut is only for the public R2 bucket');
    }
    const url = await presignR2Put(this.publicStore.client, {
      ...input,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });
    return {
      url,
      fields: {},
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      },
    };
  }

  // --- resumable (multipart) uploads --------------------------------------
  // Checklist reconciliation 2026-11-01: a 300 MB video on a bad network used
  // to restart from byte 0. The app now sends 8 MiB parts to presigned
  // UploadPart links, asks which parts S3 already has after an interruption
  // (ListParts) and sends only the missing ones. The finished object is
  // confirmed exactly like a single-request upload (size, SHA-256, content
  // type, scan), so the integrity rules do not change.

  /** Starts a multipart upload for [key]; returns S3's upload id. */
  async startMultipart(input: {
    bucket: string;
    key: string;
    contentType: string;
  }): Promise<string> {
    await this.refresh();
    const out = await this.clientFor(input.bucket).send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        CacheControl: this.cacheControlFor(input.bucket),
      }),
    );
    if (!out.UploadId) throw new Error('S3 returned no multipart upload id');
    return out.UploadId;
  }

  /** A presigned PUT link for one part (1-based). The length is not signed:
   * the last part is shorter; the total is checked at completion. */
  async presignPart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    partNumber: number;
    expiresSec: number;
  }): Promise<string> {
    await this.refresh();
    return getSignedUrl(
      this.clientFor(input.bucket),
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: input.expiresSec },
    );
  }

  /** Parts S3 already holds for the upload, ascending by number. */
  async listParts(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<{ partNumber: number; size: number; etag: string }[]> {
    await this.refresh();
    const client = this.clientFor(bucket);
    const parts: { partNumber: number; size: number; etag: string }[] = [];
    let marker: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const out = await client.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
          MaxParts: 1000,
        }),
      );
      for (const p of out.Parts ?? []) {
        if (p.PartNumber && p.ETag) {
          parts.push({
            partNumber: p.PartNumber,
            size: Number(p.Size ?? 0),
            etag: p.ETag,
          });
        }
      }
      if (!out.IsTruncated || !out.NextPartNumberMarker) break;
      marker = String(out.NextPartNumberMarker);
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(
    bucket: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    await this.refresh();
    await this.clientFor(bucket).send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  /** Throws away the uploaded parts (an abandoned upload). Never throws for
   * an upload S3 no longer knows. */
  async abortMultipart(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    await this.refresh();
    try {
      await this.clientFor(bucket).send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchUpload') return;
      throw err;
    }
  }

  async head(bucket: string, key: string): Promise<ObjectHead | null> {
    await this.refresh();
    const client = this.clientFor(bucket);
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        size: Number(res.ContentLength ?? 0),
        contentType: res.ContentType,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async read(bucket: string, key: string): Promise<Buffer> {
    await this.refresh();
    const client = this.clientFor(bucket);
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return Buffer.alloc(0);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  /** The first [bytes] of an object (all of it when it is shorter). */
  async readStart(bucket: string, key: string, bytes: number): Promise<Buffer> {
    await this.refresh();
    const res = await this.clientFor(bucket).send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${bytes - 1}`,
      }),
    );
    if (!res.Body) return Buffer.alloc(0);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  /**
   * Security audit 2026-11-08 (M3): server-side copy inside one bucket —
   * S3 / R2 / MinIO copy the bytes themselves, nothing passes through the
   * API. Content-Type and Cache-Control are copied with the object
   * (MetadataDirective COPY, the default). Used by confirm to move a checked
   * upload to a key no presigned link can write. False when [fromKey] is
   * not there.
   */
  async copy(bucket: string, fromKey: string, toKey: string): Promise<boolean> {
    await this.refresh();
    const source = fromKey.split('/').map(encodeURIComponent).join('/');
    try {
      await this.clientFor(bucket).send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: toKey,
          CopySource: `${bucket}/${source}`,
        }),
      );
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.refresh();
    const client = this.clientFor(bucket);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: this.cacheControlFor(bucket),
      }),
    );
  }

  /**
   * Streams [body] to S3 as a multipart upload (WP-G 2026-10-25, #366):
   * memory is [queueSize] x [partSizeBytes], never the whole object (a body
   * under one part is a single put). A failed or cancelled stream aborts the
   * upload (no orphan parts are billed); the bucket lifecycle also aborts
   * uploads left open for 7 days. Ready piece: @aws-sdk/lib-storage `Upload`.
   * Privacy round 13 (S13-8, #360): returns the byte count and SHA-256 of
   * what was stored.
   */
  async putStream(
    bucket: string,
    key: string,
    body: Readable | AsyncIterable<Buffer | Uint8Array | string>,
    contentType: string,
    opts: { partSizeBytes?: number; queueSize?: number } = {},
  ): Promise<{ bytes: number; sha256: string }> {
    await this.refresh();
    const client = this.clientFor(bucket);
    const hash = createHash('sha256');
    let bytes = 0;
    async function* counted(): AsyncGenerator<Buffer> {
      for await (const c of body as AsyncIterable<
        Buffer | Uint8Array | string
      >) {
        const b = typeof c === 'string' ? Buffer.from(c) : Buffer.from(c);
        hash.update(b);
        bytes += b.length;
        yield b;
      }
    }
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: Readable.from(counted(), { objectMode: false }),
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      },
      partSize: opts.partSizeBytes ?? MULTIPART_PART_BYTES,
      queueSize: opts.queueSize ?? 2,
      leavePartsOnError: false,
    });
    try {
      await upload.done();
    } catch (e) {
      await upload.abort().catch(() => undefined);
      throw e;
    }
    return { bytes, sha256: hash.digest('hex') };
  }

  /** Object keys under [prefix] (up to [maxKeys]); for small, known
   * prefixes such as the erasure ledger. */
  async listKeys(
    bucket: string,
    prefix: string,
    maxKeys = 100_000,
  ): Promise<string[]> {
    await this.refresh();
    const client = this.clientFor(bucket);
    const keys: string[] = [];
    let token: string | undefined;
    while (keys.length < maxKeys) {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      if (!res.IsTruncated || !res.NextContinuationToken) break;
      token = res.NextContinuationToken;
    }
    return keys;
  }

  /**
   * Deletes objects; a missing key is not an error (idempotent). The keys
   * in `invalidateKeys` (takedown, erasure, deleted confidential files)
   * also have their CloudFront edge copies queued for invalidation (S2-1);
   * a cleanup of never-served files passes none, invalidations cost money.
   */
  async remove(
    bucket: string,
    keys: string[],
    opts: { invalidateKeys?: string[]; purgeEdge?: boolean } = {},
  ): Promise<void> {
    if (keys.length === 0) return;
    await this.refresh();
    const client = this.clientFor(bucket);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (this.isPublicStoreBucket(bucket)) {
      // purgeEdge false: objects never handed out (an upload key after
      // confirm), so a Cloudflare purge would only cost a request.
      if (opts.purgeEdge !== false) await this.purgeEdge(keys);
    } else if (opts.invalidateKeys?.length) {
      await this.queueInvalidation(bucket, opts.invalidateKeys);
    }
  }

  /** The CloudFront target that fronts [bucket] (AWS buckets only). */
  private cdnTargetOf(bucket: string): CdnTarget | null {
    if (!this.buckets) return null;
    if (bucket === this.buckets.media) return 'media';
    if (bucket === this.buckets.documents && this.privateCdn) {
      return 'documents';
    }
    return null;
  }

  /** Queues the wildcard invalidation paths; a failure is only logged (the
   * object is already gone, the edge copy then expires by its TTL). */
  private async queueInvalidation(
    bucket: string,
    keys: string[],
  ): Promise<void> {
    const target = this.cdnTargetOf(bucket);
    if (!target || !this.invalidations) return;
    const id = this.config.get<string>(
      target === 'media'
        ? 'CLOUDFRONT_MEDIA_DISTRIBUTION_ID'
        : 'CLOUDFRONT_PRIVATE_DISTRIBUTION_ID',
    );
    if (!id) return;
    try {
      if (
        this.settings &&
        (await this.settings.string('cdn.invalidate_on_delete')) === 'off'
      ) {
        return;
      }
      await this.invalidations.enqueue(target, keys);
    } catch (err) {
      this.logger.warn({ err, target }, 'CDN invalidation was not queued');
    }
  }

  /**
   * Best effort: asks Cloudflare to drop the edge copies of removed
   * objects (needs the optional zone id + purge token). A failure is only
   * logged; the origin object is already gone.
   */
  private async purgeEdge(keys: string[]): Promise<void> {
    const store = this.publicStore;
    if (!store?.zoneId || !store.purgeToken) return;
    const urls = keys.map((k) => this.publicUrl(store, k));
    try {
      for (let i = 0; i < urls.length; i += 30) {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(store.zoneId)}/purge_cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${store.purgeToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files: urls.slice(i, i + 30) }),
          },
        );
        if (!res.ok) {
          this.logger.warn(
            { status: res.status },
            'Cloudflare cache purge was refused',
          );
        }
      }
    } catch (err) {
      this.logger.warn({ err }, 'Cloudflare cache purge failed');
    }
  }

  private publicUrl(store: PublicStore, key: string): string {
    return `${store.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** The public (unsigned, cacheable) link of an R2 object, or null for
   * an AWS object. Only ever answers for the R2 bucket. */
  publicObjectUrl(bucket: string, key: string): string | null {
    return this.publicStore && this.isPublicStoreBucket(bucket)
      ? this.publicUrl(this.publicStore, key)
      : null;
  }

  /** True when private media goes through CloudFront signed URLs. */
  get privateCdnEnabled(): boolean {
    return this.privateCdn !== undefined;
  }

  /**
   * Short-lived signed GET link. The documents bucket goes through the
   * CloudFront key group when configured (the edge caches the immutable
   * bytes, the signature expires); otherwise a presigned S3 GET.
   */
  async signedGetUrl(
    bucket: string,
    key: string,
    expiresSec: number,
    /** Owner 2026-10-05: browsers save the file under this name. */
    downloadName?: string,
  ): Promise<string> {
    await this.refresh();
    // R2 holds public media only: its link is the cacheable custom domain.
    const publicLink = this.publicObjectUrl(bucket, key);
    if (publicLink) return publicLink;
    const { client, buckets } = this.require();
    const ttl = Math.max(1, Math.floor(expiresSec));
    if (this.privateCdn && bucket === buckets.documents) {
      return signCloudFrontUrl(this.privateCdn, key, ttl, downloadName);
    }
    const window = signingWindow(ttl);
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        // Package I: the signed link may expire, the bytes never change —
        // the client keeps them by the unsigned URL.
        ResponseCacheControl: this.cacheControlFor(bucket),
        ...(downloadName
          ? { ResponseContentDisposition: contentDisposition(downloadName) }
          : {}),
      }),
      { expiresIn: window.expiresIn, signingDate: window.signingDate },
    );
  }

  /** Dev/test only (FilesBootstrap): creates missing buckets, private. */
  async ensureBuckets(): Promise<string[]> {
    await this.refresh();
    const { client, buckets } = this.require();
    const created: string[] = [];
    for (const name of new Set(Object.values(buckets))) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: name }));
      } catch (err) {
        if (!isNotFound(err)) throw err;
        await client.send(new CreateBucketCommand({ Bucket: name }));
        created.push(name);
      }
    }
    return created;
  }

  onModuleDestroy(): void {
    this.client?.destroy();
    this.publicStore?.client.destroy();
  }

  private require(): { client: S3Client; buckets: Record<BucketKind, string> } {
    if (!this.client || !this.buckets) {
      throw new ServiceUnavailableException({
        code: ErrorCode.FILE_STORAGE_UNAVAILABLE,
        message: 'File storage is not configured.',
      });
    }
    return { client: this.client, buckets: this.buckets };
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.name === 'NoSuchBucket' ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/**
 * CloudFront canned-policy signature over the full URL. The response-*
 * query parameters are part of the cache key and forwarded to S3 (OAC
 * signs them), so the download name and the immutable Cache-Control
 * survive the CDN exactly as with a presigned S3 GET.
 */
export function signCloudFrontUrl(
  cdn: PrivateCdn,
  key: string,
  ttlSec: number,
  downloadName?: string,
  now: number = Date.now(),
): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  const params = new URLSearchParams({
    'response-cache-control': PRIVATE_CACHE_CONTROL,
  });
  if (downloadName) {
    params.set(
      'response-content-disposition',
      contentDisposition(downloadName),
    );
  }
  const url = `https://${cdn.domain}/${path}?${params.toString()}`;
  const window = signingWindow(ttlSec, now);
  return cloudFrontSignedUrl({
    url,
    keyPairId: cdn.keyPairId,
    privateKey: cdn.privateKey,
    dateLessThan: new Date(
      window.signingDate.getTime() + window.expiresIn * 1000,
    ).toISOString(),
  });
}

/** Longest stretch one signed link is reused for (one hour). */
export const SIGNING_BUCKET_SEC = 60 * 60;
/** Links shorter than this are not bucketed at all. */
const MIN_BUCKETED_TTL_SEC = 60;

/**
 * Owner 2026-11-08 (ETag / 304, «не грузить сервер»): a signed link made
 * from the current second differed in every answer, so a page with private
 * media never matched its ETag and the browser fetched the same picture
 * again. Like CDN token signing with a time bucket, the link is signed from
 * the start of a bucket of a tenth of its TTL (at most one hour), so every
 * answer inside the bucket carries the same link. The life stays exactly
 * [ttlSec] from the bucket start: a link never outlives its TTL (the
 * security contract of signed links), it is only up to a tenth shorter.
 */
export function signingWindow(
  ttlSec: number,
  now: number = Date.now(),
): { signingDate: Date; expiresIn: number } {
  const ttl = Math.max(1, Math.floor(ttlSec));
  // A short link (under a minute: verification documents in tests, one-off
  // downloads) is signed from the current second, exactly as before.
  const bucket =
    (ttl < MIN_BUCKETED_TTL_SEC
      ? 1
      : Math.min(SIGNING_BUCKET_SEC, Math.floor(ttl / 10))) * 1000;
  return {
    signingDate: new Date(Math.floor(now / bucket) * bucket),
    expiresIn: ttl,
  };
}

/** RFC 6266 attachment header: an ASCII fallback plus the UTF-8 name. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
