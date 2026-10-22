import {
  DetectModerationLabelsCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SecretsService } from '../../common/secrets/secrets.service';
import type { ModerationLabel } from './media-moderation.constants';

/** One image's moderation labels (empty = nothing unsafe found). */
export interface ImageModerationResult {
  provider: string;
  labels: ModerationLabel[];
}

/** Owner 2026-10-22: the seam for an image moderation service (AWS
 * Rekognition today; Google SafeSearch / Hive could replace it). */
export interface ImageModerationProvider {
  readonly name: string;
  /** Keys / region present (admin integrations or env). */
  configured(): Promise<boolean>;
  /** [jpeg] is a JPEG or PNG ≤ 5 MB. */
  detect(jpeg: Buffer, minConfidence: number): Promise<ImageModerationResult>;
}

export const IMAGE_MODERATION_PROVIDER = Symbol('IMAGE_MODERATION_PROVIDER');

/**
 * AWS Rekognition `DetectModerationLabels` (image bytes, no S3 access
 * needed): nudity, violence, drugs, hate symbols… with a confidence per
 * label (https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html).
 * Credentials: the admin integration `aws_rekognition` (region + optional
 * keys; empty keys = the ECS task role), env REKOGNITION_* as fallback.
 * One client per key set, rebuilt when the keys change.
 */
@Injectable()
export class RekognitionModerationProvider
  implements ImageModerationProvider, OnModuleDestroy
{
  readonly name = 'aws_rekognition';
  private client?: { fingerprint: string; client: RekognitionClient };

  constructor(private readonly secrets: SecretsService) {}

  async configured(): Promise<boolean> {
    return this.secrets.has('aws_rekognition');
  }

  async detect(
    jpeg: Buffer,
    minConfidence: number,
  ): Promise<ImageModerationResult> {
    const client = await this.rekognition();
    const res = await client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: jpeg },
        MinConfidence: minConfidence,
      }),
    );
    return {
      provider: this.name,
      labels: (res.ModerationLabels ?? []).map((l) => ({
        name: l.Name ?? 'unknown',
        parent: l.ParentName ? l.ParentName : null,
        confidence: Math.round((l.Confidence ?? 0) * 100) / 100,
      })),
    };
  }

  private async rekognition(): Promise<RekognitionClient> {
    const c = await this.secrets.get('aws_rekognition');
    if (!c?.fields.region) throw new Error('aws_rekognition not configured');
    if (this.client?.fingerprint === c.fingerprint) return this.client.client;
    this.client?.client.destroy();
    const { region, accessKeyId, secretAccessKey } = c.fields;
    const client = new RekognitionClient({
      region,
      maxAttempts: 3,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
    this.client = { fingerprint: c.fingerprint, client };
    return client;
  }

  onModuleDestroy(): void {
    this.client?.client.destroy();
  }
}
