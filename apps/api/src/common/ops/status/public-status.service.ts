import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { createR2Client } from '../../secrets/r2-client';
import { SecretsService } from '../../secrets/secrets.service';
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
/** Stage 2 SRE (Б4): the backup copy outside AWS, in the public R2 bucket. */
export const STATUS_BACKUP_PREFIX = 'status/';

/** The page (apps/status-page/index.html), copied into the API image. */
function statusPageHtmlPath(): string {
  return (
    process.env.STATUS_PAGE_HTML ??
    resolve(process.cwd(), '../status-page/index.html')
  );
}
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
  private backup?: { sig: string; client: S3Client; bucket: string };
  /** The R2 bucket the page itself was last copied to (once per process). */
  private backupPageFor?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly probes: StatusProbesService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(PublicStatusService.name);
  }

  /**
   * Stage 2 SRE (Б4, SRE Workbook ch. 9 «Incident Response»: the way to tell
   * people must not depend on the system that is down): the R2 bucket of the
   * public media (Интеграции → Cloudflare R2), when its keys are saved and
   * `ops.status_page_backup_enabled` is on. Undefined = no backup.
   */
  private async backupTarget(): Promise<
    { sig: string; client: S3Client; bucket: string } | undefined
  > {
    if (!this.secrets) return undefined;
    if (
      this.settings &&
      !(await this.settings.boolean('ops.status_page_backup_enabled'))
    ) {
      return undefined;
    }
    const c = await this.secrets.get('cloudflare_r2');
    const f = c?.fields as Record<string, string | undefined> | undefined;
    const accountId = f?.accountId?.trim();
    const accessKeyId = f?.accessKeyId?.trim();
    const secretAccessKey = f?.secretAccessKey?.trim();
    const bucket = f?.bucket?.trim();
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      return undefined;
    }
    // A new key set (rotation) builds a new client.
    const sig = `${c?.fingerprint ?? ''}/${bucket}`;
    if (this.backup?.sig !== sig) {
      this.backup = {
        sig,
        client: createR2Client({ accountId, accessKeyId, secretAccessKey }),
        bucket,
      };
    }
    return this.backup;
  }

  /** Writes the backup copy. Never throws. */
  private async publishBackup(
    target: { sig: string; client: S3Client; bucket: string },
    body: string,
  ): Promise<boolean> {
    try {
      await target.client.send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: `${STATUS_BACKUP_PREFIX}${STATUS_OBJECT_KEY}`,
          Body: body,
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'public, max-age=30',
        }),
      );
      if (this.backupPageFor !== target.sig) {
        const html = await readFile(statusPageHtmlPath(), 'utf8').catch(
          () => null,
        );
        if (html) {
          await target.client.send(
            new PutObjectCommand({
              Bucket: target.bucket,
              Key: `${STATUS_BACKUP_PREFIX}index.html`,
              Body: html,
              ContentType: 'text/html; charset=utf-8',
              CacheControl: 'public, max-age=300',
            }),
          );
          this.backupPageFor = target.sig;
        }
      }
      return true;
    } catch (e) {
      this.logger.warn(
        { err: (e as Error).message },
        'status backup publish failed',
      );
      return false;
    }
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

  /** Push the document (AWS page, and the R2 backup when it has keys).
   * Never throws: the watchdog must not fail on it. True = the AWS copy
   * was written. */
  async publish(probes?: ProbeResult[], now = new Date()): Promise<boolean> {
    const bucket = this.config.get<string>('STATUS_PAGE_BUCKET');
    const backup = await this.backupTarget().catch(() => undefined);
    if (!bucket && !backup) return false;
    let body: string;
    try {
      body = JSON.stringify(await this.snapshot(probes, now));
    } catch (e) {
      this.logger.warn({ err: (e as Error).message }, 'status publish failed');
      return false;
    }
    // The two copies are independent: one failing never stops the other.
    const [aws] = await Promise.all([
      bucket ? this.publishAws(bucket, body) : Promise.resolve(false),
      backup ? this.publishBackup(backup, body) : Promise.resolve(false),
    ]);
    return aws;
  }

  private async publishAws(bucket: string, body: string): Promise<boolean> {
    try {
      this.client ??= new S3Client({
        region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      });
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: STATUS_OBJECT_KEY,
          Body: body,
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
          },
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
