import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { buildDataExportEmail } from '../auth/notifications/email-templates';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_EMAIL } from '../notifications/push/push.constants';
import { DATA_EXPORT_LINK_TTL_SEC } from './privacy.constants';

/** JSON with BigInt/Date friendly to `JSON.stringify`. */
function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

/**
 * docs/06 §5.2: collects the user's own data (profile, cases, bids, posts,
 * comments, likes, own messages, consents, devices) into JSON files inside
 * one ZIP, stores it in the private documents bucket, records the `files`
 * row and the `data_export_jobs` result, then notifies (push row + email
 * with a 24-hour link).
 */
@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_EMAIL) private readonly email: EmailProvider,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DataExportService.name);
  }

  async collect(userId: string): Promise<Record<string, unknown>> {
    const p = this.prisma;
    const [
      user,
      clientProfile,
      attorneyProfile,
      consents,
      sessions,
      cases,
      bids,
      posts,
      comments,
      postLikes,
      commentLikes,
      messages,
    ] = await Promise.all([
      p.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          status: true,
          first_name: true,
          last_name: true,
          email: true,
          email_verified_at: true,
          phone_e164: true,
          phone_verified_at: true,
          ui_language: true,
          theme: true,
          created_at: true,
        },
      }),
      p.clientProfile.findUnique({ where: { user_id: userId } }),
      p.attorneyProfile.findUnique({
        where: { user_id: userId },
        include: { licenses: true, practice_areas: true },
      }),
      p.userConsent.findMany({ where: { user_id: userId } }),
      p.session.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          device_id: true,
          device_name: true,
          platform: true,
          app_version: true,
          ip: true,
          created_at: true,
          last_used_at: true,
          revoked_at: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      p.case.findMany({ where: { client_id: userId } }),
      p.bid.findMany({ where: { attorney_id: userId } }),
      p.post.findMany({ where: { author_id: userId } }),
      p.comment.findMany({ where: { author_id: userId } }),
      p.postLike.findMany({ where: { user_id: userId } }),
      p.commentLike.findMany({ where: { user_id: userId } }),
      p.message.findMany({
        where: { sender_id: userId },
        select: {
          id: true,
          conversation_id: true,
          type: true,
          body_original: true,
          created_at: true,
        },
        orderBy: { created_at: 'asc' },
      }),
    ]);
    return {
      'profile.json': { user, clientProfile, attorneyProfile },
      'consents.json': consents,
      'devices.json': sessions,
      'cases.json': cases,
      'bids.json': bids,
      'posts.json': posts,
      'comments.json': comments,
      'likes.json': { posts: postLikes, comments: commentLikes },
      'messages.json': messages,
    };
  }

  async zip(
    files: Record<string, unknown>,
    generatedAt: Date,
  ): Promise<Buffer> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const finished = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.append(
      toJson({
        generatedAt: generatedAt.toISOString(),
        files: Object.keys(files),
        note: 'LawBid data export (docs/06 §5.2).',
      }),
      { name: 'README.json' },
    );
    for (const [name, value] of Object.entries(files)) {
      archive.append(toJson(value), { name });
    }
    await archive.finalize();
    await finished;
    return Buffer.concat(chunks);
  }

  /** The worker body: builds, stores, records and notifies. */
  async process(exportId: string): Promise<{ bytes: number }> {
    const job = await this.prisma.dataExportJob.findUnique({
      where: { id: exportId },
      include: {
        user: {
          select: { email: true, email_verified_at: true, status: true },
        },
      },
    });
    if (!job || job.type !== 'user_data') return { bytes: 0 };
    // Atomic claim: the BullMQ worker and a manual/retry call never build
    // the same export twice (unique s3_key).
    const { count } = await this.prisma.dataExportJob.updateMany({
      where: { id: exportId, status: 'queued' },
      data: { status: 'processing' },
    });
    if (count === 0) return { bytes: 0 };
    const now = new Date();
    const zip = await this.zip(await this.collect(job.user_id), now);
    const bucket = this.storage.bucket('documents');
    const key = `exports/user-data/${job.user_id}/${exportId}.zip`;
    await this.storage.put(bucket, key, zip, 'application/zip');
    const expiresAt = new Date(now.getTime() + DATA_EXPORT_LINK_TTL_SEC * 1000);
    const file = await this.prisma.file.create({
      data: {
        owner_user_id: job.user_id,
        purpose: 'data_export',
        s3_bucket: bucket,
        s3_key: key,
        mime: 'application/zip',
        size_bytes: BigInt(zip.length),
        sha256: createHash('sha256').update(zip).digest('hex'),
        scan_status: 'clean',
      },
    });
    await this.prisma.dataExportJob.update({
      where: { id: exportId },
      data: { status: 'ready', file_id: file.id, expires_at: expiresAt },
    });
    await this.notifications.emit({
      type: 'data_export_ready',
      recipientId: job.user_id,
      payload: { exportId },
    });
    if (
      job.user.email &&
      job.user.email_verified_at &&
      job.user.status === 'active'
    ) {
      try {
        const url = await this.storage.signedGetUrl(
          bucket,
          key,
          DATA_EXPORT_LINK_TTL_SEC,
        );
        await this.email.sendEmail(
          buildDataExportEmail({
            email: job.user.email,
            url,
            expiresAt,
            appLinkBaseUrl: this.config.get<string>('APP_LINK_BASE_URL'),
          }),
        );
      } catch (error) {
        // The in-app notification and GET /users/me/data-export/:id still
        // hand out the link; the email is best effort.
        this.logger.warn(
          { exportId, err: error instanceof Error ? error.message : error },
          'data export email failed',
        );
      }
    }
    return { bytes: zip.length };
  }
}
