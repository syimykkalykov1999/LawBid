import {
  Injectable,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as cloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import type { Readable } from 'node:stream';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { BucketKind } from '../files.policy';

/**
 * Owner 2026-10-22 (client economy plan, package I): every object key is
 * unique (a file id / content hash — a changed file is a new key), so the
 * bytes behind a key never change. Browsers, the Flutter web build and
 * CloudFront may therefore keep them for a year; the header is written on
 * the object (uploads) and asked for on signed reads.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

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

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(S3StorageService.name);
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
    }
    try {
      this.r2Selected =
        (await this.settings?.string('media.public_store')) === 'r2';
    } catch {
      this.r2Selected = false;
    }
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
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        // Newer SDK checksums are not accepted by every R2 operation.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
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

  /** New public media goes to R2 now (switch on and R2 configured). */
  get publicStoreActive(): boolean {
    return this.r2Selected && this.publicStore !== undefined;
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
   * switch is on and R2 is configured. Call [resolveBucket] when the
   * switch may not have been read yet.
   */
  bucket(kind: BucketKind): string {
    const { buckets } = this.require();
    if (
      kind === 'media' &&
      this.publicStore &&
      this.r2Selected &&
      this.isPublicStoreBucket(this.publicStore.bucket)
    ) {
      return this.publicStore.bucket;
    }
    return buckets[kind];
  }

  /** [bucket] after loading the keys and the switch. */
  async resolveBucket(kind: BucketKind): Promise<string> {
    await this.refresh();
    return this.bucket(kind);
  }

  /** The AWS bucket of [kind], whatever the switch says (older apps that
   * cannot do a presigned PUT keep uploading public media to AWS). */
  awsBucket(kind: BucketKind): string {
    return this.require().buckets[kind];
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
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
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
    const url = await getSignedUrl(
      this.publicStore.client,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.size,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
      {
        expiresIn: input.expiresSec,
        signableHeaders: new Set([
          'content-type',
          'content-length',
          'cache-control',
        ]),
      },
    );
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
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  /**
   * Streams [body] to S3 as a multipart upload (WP-G 2026-10-25): memory is
   * [queueSize] x [partSizeBytes], never the whole object. A failed or
   * cancelled stream aborts the upload (no orphan parts are billed);
   * the bucket lifecycle also aborts uploads left open for 7 days. Ready
   * piece: @aws-sdk/lib-storage `Upload` (AWS's own multipart helper).
   */
  async putStream(
    bucket: string,
    key: string,
    body: Readable,
    contentType: string,
    opts: { partSizeBytes?: number; queueSize?: number } = {},
  ): Promise<void> {
    await this.refresh();
    const client = this.clientFor(bucket);
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      },
      partSize: opts.partSizeBytes ?? 8 * 1024 * 1024,
      queueSize: opts.queueSize ?? 2,
      leavePartsOnError: false,
    });
    try {
      await upload.done();
    } catch (e) {
      await upload.abort().catch(() => undefined);
      throw e;
    }
  }

  /** Deletes objects; a missing key is not an error (idempotent). */
  async remove(bucket: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.refresh();
    const client = this.clientFor(bucket);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (this.isPublicStoreBucket(bucket)) await this.purgeEdge(keys);
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
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        // Package I: the signed link may expire, the bytes never change —
        // the client keeps them by the unsigned URL.
        ResponseCacheControl: IMMUTABLE_CACHE_CONTROL,
        ...(downloadName
          ? { ResponseContentDisposition: contentDisposition(downloadName) }
          : {}),
      }),
      { expiresIn: ttl },
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
    'response-cache-control': IMMUTABLE_CACHE_CONTROL,
  });
  if (downloadName) {
    params.set(
      'response-content-disposition',
      contentDisposition(downloadName),
    );
  }
  const url = `https://${cdn.domain}/${path}?${params.toString()}`;
  return cloudFrontSignedUrl({
    url,
    keyPairId: cdn.keyPairId,
    privateKey: cdn.privateKey,
    dateLessThan: new Date(now + ttlSec * 1000).toISOString(),
  });
}

/** RFC 6266 attachment header: an ASCII fallback plus the UTF-8 name. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
