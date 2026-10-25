import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PUBLIC_COMPONENTS,
  buildPublicStatus,
  isManual,
  type IncidentInput,
  type PublicComponent,
  type PublicStatus,
} from './public-status';
import { StatusProbesService, type ProbeResult } from './status-probes.service';

export const STATUS_OBJECT_KEY = 'status.json';
const SINCE_HOURS = 24 * 7;

export interface ManualIncidentInput {
  component: PublicComponent;
  kind: 'degraded' | 'outage' | 'maintenance';
  titleRu: string;
  titleEn?: string;
  messageRu?: string;
  messageEn?: string;
}

/**
 * Owner 2026-10-25: builds the public status document and pushes it to a
 * static bucket (S3 + CloudFront), so the page stays up when our API is
 * down. OFF until STATUS_PAGE_BUCKET is set. Admin-written incidents live
 * in the same `system_incidents` table (detail.manual = true; the public
 * component keys never equal a probe key, so the watchdog ignores them).
 */
@Injectable()
export class PublicStatusService {
  private client?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly probes: StatusProbesService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PublicStatusService.name);
  }

  get enabled(): boolean {
    return Boolean(this.config.get<string>('STATUS_PAGE_BUCKET'));
  }

  private async incidents(now: Date): Promise<IncidentInput[]> {
    const since = new Date(now.getTime() - SINCE_HOURS * 3_600_000);
    const rows = await this.prisma.systemIncident.findMany({
      where: { OR: [{ opened_at: { gte: since } }, { closed_at: null }] },
      orderBy: { opened_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      component: r.component,
      severity: r.severity,
      title: r.title,
      detail: (r.detail ?? {}) as Record<string, unknown>,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
    }));
  }

  async snapshot(
    probes?: ProbeResult[],
    now = new Date(),
  ): Promise<PublicStatus> {
    const p = probes ?? (await this.probes.watched(now));
    return buildPublicStatus(p, await this.incidents(now), now);
  }

  /** Push the document. Never throws: the watchdog must not fail on it. */
  async publish(probes?: ProbeResult[], now = new Date()): Promise<boolean> {
    const bucket = this.config.get<string>('STATUS_PAGE_BUCKET');
    if (!bucket) return false;
    try {
      const doc = await this.snapshot(probes, now);
      this.client ??= new S3Client({
        region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      });
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: STATUS_OBJECT_KEY,
          Body: JSON.stringify(doc),
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'public, max-age=30',
        }),
      );
      return true;
    } catch (e) {
      this.logger.warn({ err: (e as Error).message }, 'status publish failed');
      return false;
    }
  }

  async listManual(now = new Date()): Promise<IncidentInput[]> {
    return (await this.incidents(now)).filter(isManual);
  }

  async post(input: ManualIncidentInput): Promise<IncidentInput> {
    if (!PUBLIC_COMPONENTS.includes(input.component)) {
      throw new ConflictException('Unknown component');
    }
    const now = new Date();
    let row;
    try {
      row = await this.prisma.systemIncident.create({
        data: {
          component: input.component,
          severity: input.kind === 'maintenance' ? 'maint' : input.kind,
          title: input.titleRu.slice(0, 200),
          detail: {
            manual: true,
            title: { ru: input.titleRu, en: input.titleEn || input.titleRu },
            message: {
              ru: input.messageRu ?? '',
              en: input.messageEn || input.messageRu || '',
            },
          } as Prisma.InputJsonObject,
          opened_at: now,
        },
      });
    } catch {
      // The partial unique index: one open row per component.
      throw new ConflictException(
        'This component already has an open incident: resolve it first.',
      );
    }
    await this.publish(undefined, now);
    return {
      id: row.id,
      component: row.component,
      severity: row.severity,
      title: row.title,
      detail: row.detail as Record<string, unknown>,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
    };
  }

  async resolve(id: string): Promise<void> {
    const row = await this.prisma.systemIncident.findUnique({ where: { id } });
    const detail = (row?.detail ?? {}) as Record<string, unknown>;
    if (!row || detail.manual !== true) throw new NotFoundException();
    if (!row.closed_at) {
      await this.prisma.systemIncident.updateMany({
        where: { id, closed_at: null },
        data: { closed_at: new Date() },
      });
    }
    await this.publish();
  }
}
