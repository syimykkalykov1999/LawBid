import {
  CompareFacesCommand,
  RekognitionClient,
  type CompareFacesCommandInput,
  type CompareFacesCommandOutput,
  type ComparedFace,
  type Image,
} from '@aws-sdk/client-rekognition';
import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VerificationDocType } from '../../../generated/prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3StorageService } from '../../files/files.public';
import { IDENTITY_DOC_TYPES } from '../verification.constants';
import type {
  CheckOutcome,
  IdVerificationInput,
  IdVerificationProvider,
} from './verification-providers';

/** `details.provider` of every face comparison row (the
 * `verification_provider` enum has no Rekognition value; the row's provider
 * column stays `manual`, like the bar lookups keep their adapter name in
 * details). Same id as the admin integration card that holds the region /
 * optional keys. */
export const FACE_MATCH_PROVIDER = 'aws_rekognition';

/** Default of `verification.face_match.similarity_threshold`. */
export const DEFAULT_SIMILARITY_THRESHOLD = 90;

/** Rekognition takes JPEG / PNG only, ≤ 5 MB as bytes and ≤ 15 MB from S3
 * (https://docs.aws.amazon.com/rekognition/latest/dg/limits.html). */
const FACE_MIMES = new Set(['image/jpeg', 'image/png']);
const MAX_BYTES_INLINE = 5 * 1024 * 1024;

/** Below these a single unmatched face is "too dark / too blurry to say",
 * not "another person": a person decides (Rekognition ImageQuality,
 * 0–100). */
const MIN_BRIGHTNESS = 20;
const MIN_SHARPNESS = 20;
/** Below this bounding-box confidence the selfie face is not trusted. */
const MIN_FACE_CONFIDENCE = 90;

/** The seam to the AWS SDK call, replaced by a fake in tests. */
export interface CompareFacesClient {
  compareFaces(
    input: CompareFacesCommandInput,
  ): Promise<CompareFacesCommandOutput>;
}
export const COMPARE_FACES_CLIENT = Symbol('COMPARE_FACES_CLIENT');

/** Manual review with a reason for the verifier (never an approval). */
function manual(
  reason: string,
  extra: Record<string, unknown> = {},
): CheckOutcome {
  return {
    result: 'manual_review',
    details: { provider: FACE_MATCH_PROVIDER, reason, ...extra },
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Owner 2026-11-12 (row 60): CompareFaces only returns the similarity of
 * faces at or above SimilarityThreshold, so it is asked from 0 % and the
 * admin threshold is applied here; «far below» (an automatic rejection)
 * needs the number. */
export const MEASURE_FROM = 0;

function lowQuality(face: ComparedFace | undefined): boolean {
  const q = face?.Quality;
  if (!q) return false;
  return (
    (q.Brightness ?? 100) < MIN_BRIGHTNESS ||
    (q.Sharpness ?? 100) < MIN_SHARPNESS
  );
}

/**
 * CompareFaces answer → CheckOutcome. Source = the selfie (Rekognition uses
 * its largest face: the attorney, not the small photo on the card they
 * hold), target = the ID front.
 * - one face on the ID, matched at ≥ threshold → pass (similarity kept);
 * - one face, below the threshold → fail, reason `selfie_mismatch`
 *   (the verifier's rejection code of the same name), unless it is too dark
 *   or blurry → manual `low_quality`;
 * - no face → manual `no_face`; a selfie face Rekognition is unsure of →
 *   manual `low_quality`;
 * - several faces on the ID where they do not all agree (a ghost image that
 *   did not match, a second person) → manual `several_faces`.
 * The result never approves or rejects a request on its own: the request
 * stays in the verifier queue (VerificationChecksService) unless the owner
 * switched on «Автоматическое решение по адвокатам» (row 60), which reads
 * it together with the registry, liveness and the AI employee.
 */
export function mapCompareFaces(
  res: CompareFacesCommandOutput,
  threshold: number,
): CheckOutcome {
  // Row 60: the call asks from 0 % (MEASURE_FROM) so a face below the
  // threshold still comes back with its similarity; split here.
  const all = res.FaceMatches ?? [];
  const matches = all.filter(
    (f) => f.Similarity !== undefined && f.Similarity >= threshold,
  );
  const unmatched: ComparedFace[] = [
    ...all.filter((f) => !matches.includes(f)).map((f) => f.Face ?? {}),
    ...(res.UnmatchedFaces ?? []),
  ];
  const measured = all.reduce<number | null>(
    (m, f) => (f.Similarity === undefined ? m : Math.max(m ?? 0, f.Similarity)),
    null,
  );
  const best = matches.length > 0 ? measured : null;
  const base = {
    threshold,
    similarity: measured === null ? null : round1(measured),
    targetFaces: all.length + (res.UnmatchedFaces ?? []).length,
  };
  const sourceConfidence = res.SourceImageFace?.Confidence;
  if (
    sourceConfidence !== undefined &&
    sourceConfidence < MIN_FACE_CONFIDENCE
  ) {
    return manual('low_quality', base);
  }
  if (base.targetFaces === 0) return manual('no_face', base);
  if (base.targetFaces > 1 && (unmatched.length > 0 || best === null)) {
    return manual('several_faces', base);
  }
  if (best !== null && best >= threshold) {
    return {
      result: 'pass',
      details: { provider: FACE_MATCH_PROVIDER, ...base },
    };
  }
  if (lowQuality(unmatched[0] ?? matches[0]?.Face)) {
    return manual('low_quality', base);
  }
  return {
    result: 'fail',
    details: {
      provider: FACE_MATCH_PROVIDER,
      reason: 'selfie_mismatch',
      ...base,
    },
  };
}

interface StoredImage {
  bucket: string;
  key: string;
  mime: string;
  size: number;
}

/**
 * Owner 2026-11-12 (row 52): the attorney's selfie against the photo on
 * their ID with Amazon Rekognition CompareFaces (official AWS SDK v3,
 * Apache-2.0). Both pictures are read from the private documents bucket by
 * S3 object reference (never a public or signed URL); when Rekognition
 * cannot open the object (own S3-compatible store, a key policy it may not
 * use) the bytes are read by the API from the same private object and sent
 * inline. Credentials: on ECS the task role (Terraform grants
 * rekognition:CompareFaces), else the admin card `aws_rekognition` keys,
 * else the default AWS chain. Fail-safe: every error is `manual_review`.
 * `verify` (is the document genuine) stays a person's job.
 */
@Injectable()
export class RekognitionIdVerificationProvider
  implements IdVerificationProvider, OnModuleDestroy
{
  readonly name = FACE_MATCH_PROVIDER;
  private sdk?: { fingerprint: string; client: RekognitionClient };

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger,
    @Optional()
    @Inject(COMPARE_FACES_CLIENT)
    private readonly injected?: CompareFacesClient,
  ) {
    this.logger.setContext(RekognitionIdVerificationProvider.name);
  }

  verify(): Promise<CheckOutcome> {
    return Promise.resolve(manual('document_checked_by_person'));
  }

  async matchFace(input: IdVerificationInput): Promise<CheckOutcome> {
    try {
      const images = await this.images(input.requestId);
      if ('reason' in images) return manual(images.reason);
      const threshold = await this.threshold();
      const res = await this.compare(images.selfie, images.id);
      return mapCompareFaces(res, threshold);
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      const known: Record<string, string> = {
        InvalidParameterException: 'no_face',
        InvalidImageFormatException: 'unsupported_format',
        ImageTooLargeException: 'image_too_large',
      };
      if (!known[name]) {
        this.logger.warn(
          { requestId: input.requestId, err: name },
          'face match failed — manual review',
        );
      }
      return manual(known[name] ?? 'provider_error', { error: name });
    }
  }

  private async threshold(): Promise<number> {
    const raw = await this.settings
      .number('verification.face_match.similarity_threshold')
      .catch(() => NaN);
    return Number.isFinite(raw) && raw >= 0 && raw <= 100
      ? raw
      : DEFAULT_SIMILARITY_THRESHOLD;
  }

  /** The newest ID front (or single-sided ID) and the newest selfie. */
  private async images(
    requestId: string,
  ): Promise<{ selfie: StoredImage; id: StoredImage } | { reason: string }> {
    const docs = await this.prisma.verificationDocument.findMany({
      where: {
        request_id: requestId,
        doc_type: {
          in: [...IDENTITY_DOC_TYPES, 'selfie'] as VerificationDocType[],
        },
      },
      orderBy: { created_at: 'desc' },
      select: {
        doc_type: true,
        side: true,
        file: {
          select: {
            s3_bucket: true,
            s3_key: true,
            mime: true,
            size_bytes: true,
            scan_status: true,
            deleted_at: true,
          },
        },
      },
    });
    const selfie = docs.find((d) => d.doc_type === 'selfie');
    const id = docs.find((d) => d.doc_type !== 'selfie' && d.side !== 'back');
    if (!selfie || !id) return { reason: 'image_missing' };
    for (const d of [selfie, id]) {
      if (d.file.deleted_at) return { reason: 'image_missing' };
      if (d.file.scan_status !== 'clean') return { reason: 'file_not_clean' };
      if (!FACE_MIMES.has(d.file.mime)) return { reason: 'unsupported_format' };
    }
    const toImage = (d: (typeof docs)[number]): StoredImage => ({
      bucket: d.file.s3_bucket,
      key: d.file.s3_key,
      mime: d.file.mime,
      size: Number(d.file.size_bytes),
    });
    return { selfie: toImage(selfie), id: toImage(id) };
  }

  private async compare(
    source: StoredImage,
    target: StoredImage,
  ): Promise<CompareFacesCommandOutput> {
    const client = await this.client();
    // An own S3-compatible store (S3_ENDPOINT) is out of Rekognition's reach.
    const inline = Boolean(this.config.get<string>('S3_ENDPOINT'));
    const call = async (bytes: boolean) =>
      client.compareFaces({
        SourceImage: await this.image(source, bytes),
        TargetImage: await this.image(target, bytes),
        // Row 60: measured from 0 %, compared with [threshold] in
        // mapCompareFaces (a clear mismatch then has its similarity).
        SimilarityThreshold: MEASURE_FROM,
        QualityFilter: 'AUTO',
      });
    try {
      return await call(inline);
    } catch (err) {
      if (
        !inline &&
        err instanceof Error &&
        err.name === 'InvalidS3ObjectException'
      ) {
        return call(true);
      }
      throw err;
    }
  }

  private async image(img: StoredImage, bytes: boolean): Promise<Image> {
    if (!bytes) return { S3Object: { Bucket: img.bucket, Name: img.key } };
    if (img.size > MAX_BYTES_INLINE) {
      const err = new Error('image over the 5 MB inline limit');
      err.name = 'ImageTooLargeException';
      throw err;
    }
    return { Bytes: await this.storage.read(img.bucket, img.key) };
  }

  /** Task role first (ECS), then the admin card keys, then the default
   * AWS chain. The region is the documents bucket's (S3Object must be in
   * the same region), then the card's. */
  private async client(): Promise<CompareFacesClient> {
    if (this.injected) return this.injected;
    const card = await this.secrets.get(FACE_MATCH_PROVIDER).catch(() => null);
    const region =
      this.config.get<string>('S3_REGION') ||
      card?.fields.region ||
      this.config.get<string>('AWS_REGION');
    if (!region) throw new Error('no AWS region for Rekognition');
    const onRole = Boolean(
      this.config.get<string>('AWS_CONTAINER_CREDENTIALS_RELATIVE_URI') ||
      this.config.get<string>('AWS_CONTAINER_CREDENTIALS_FULL_URI'),
    );
    const keys =
      !onRole && card?.fields.accessKeyId && card.fields.secretAccessKey
        ? {
            accessKeyId: card.fields.accessKeyId,
            secretAccessKey: card.fields.secretAccessKey,
          }
        : undefined;
    const fingerprint = `${region}|${keys ? card?.fingerprint : 'role'}`;
    if (this.sdk?.fingerprint !== fingerprint) {
      this.sdk?.client.destroy();
      this.sdk = {
        fingerprint,
        client: new RekognitionClient({
          region,
          maxAttempts: 3,
          ...(keys ? { credentials: keys } : {}),
        }),
      };
    }
    const sdk = this.sdk.client;
    return {
      compareFaces: (input) => sdk.send(new CompareFacesCommand(input)),
    };
  }

  onModuleDestroy(): void {
    this.sdk?.client.destroy();
  }
}
