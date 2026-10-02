import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationCategory, NotificationType } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EmailProvider } from '../../auth/providers/email/email-provider.interface';
import { buildNotificationEmail } from '../../auth/notifications/email-templates';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { BadgesService } from '../badges.service';
import {
  DEFAULT_PUSH,
  EMAIL_TYPES,
  LOCKED_CATEGORIES,
  QUIET_EXEMPT,
  quietHoursEnd,
} from '../notification-rules';
import { NotificationTemplateService } from './notification-template.service';
import { PushQueueService } from './push-queue.service';
import {
  NOTIFICATION_EMAIL,
  PUSH_MODULE_OPTIONS,
  PUSH_QUEUE,
  PUSH_SENDER,
  type MessageJobData,
  type CallJobData,
  type NotificationJobData,
  type PushJobData,
  type PushSender,
} from './push.constants';

export interface PushModuleOptions {
  mode: 'api' | 'worker';
}

/** Not committed yet (or rolled back): BullMQ retries, then drops it. */
export class NotificationNotCommittedError extends Error {}

export type DispatchResult =
  | 'sent'
  | 'no_push'
  | 'disabled'
  | 'muted'
  | 'viewing'
  | 'deferred'
  | 'no_user';

/** Push body of a chat message: body_display, shortened (§9.5 "тексты
 * сообщений маскированы как body_display"). */
const MESSAGE_PREVIEW_CHARS = 120;

/**
 * Consumer of the `push` queue (docs/05 §9.3 steps 3–5), after the
 * emitting transaction committed:
 * - a stored notification: realtime `notification:new` + badge, then —
 *   only for the first row of an aggregate and push types — the category
 *   setting (`system` locked on), quiet hours (deferred to their end,
 *   except security_new_device), the push, and email for `system` types;
 * - a chat message (`new_message`, never stored): skipped while the chat
 *   is muted or open on a device of the recipient.
 */
@Injectable()
export class PushDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<PushJobData>;

  constructor(
    @Inject(PUSH_MODULE_OPTIONS) private readonly options: PushModuleOptions,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly templates: NotificationTemplateService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    @Inject(NOTIFICATION_EMAIL) private readonly email: EmailProvider,
    private readonly queue: PushQueueService,
    private readonly badges: BadgesService,
    private readonly realtime: RealtimePublisher,
    private readonly logger: PinoLogger,
    // Security audit 2026-10-01: notification emails count against the
    // same daily/monthly email budget as OTP mail.
    @Optional() private readonly costGuard?: CostGuardService,
  ) {
    this.logger.setContext(PushDispatcher.name);
  }

  get enabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.worker = new Worker<PushJobData>(
      PUSH_QUEUE,
      (job: Job<PushJobData>) => this.dispatch(job.data, job.id ?? ''),
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 20 },
    );
    this.worker.on('error', (error) => {
      this.logger.error({ err: error.message }, 'push worker error');
    });
  }

  /** Returns what happened (tests, dashboards). */
  async dispatch(data: PushJobData, jobId: string): Promise<DispatchResult> {
    if (data.kind === 'call') return this.dispatchCall(data);
    return data.kind === 'message'
      ? this.dispatchMessage(data, jobId)
      : this.dispatchNotification(data, jobId);
  }

  /** OQ-041: ring the callee while the call is still ringing. Calls ring
   * through quiet hours and chat mute, like a phone; only a blocked or
   * inactive recipient is skipped ("calls" off = rings silently). */
  private async dispatchCall(data: CallJobData): Promise<DispatchResult> {
    const call = await this.prisma.call.findUnique({
      where: { id: data.callId },
      select: {
        status: true,
        conversation_id: true,
        callee: { select: { status: true, ui_language: true } },
        caller: {
          select: { first_name: true, last_name: true },
        },
      },
    });
    if (!call || call.callee.status !== 'active') return 'no_user';
    if (call.status !== 'ringing') return 'no_push';
    // Owner 2026-10-02: calls switched off still come through — silently
    // (no ringtone), so a call is never lost.
    const silent = !(await this.pushAllowed(data.recipientId, 'calls'));
    const name =
      [call.caller.first_name, call.caller.last_name]
        .filter(Boolean)
        .join(' ') || 'LawBid';
    await this.sender.send(
      {
        userId: data.recipientId,
        title: name,
        body:
          call.callee.ui_language === 'ru'
            ? '📞 Входящий звонок'
            : '📞 Incoming call',
        data: {
          type: 'incoming_call',
          callId: data.callId,
          conversationId: call.conversation_id,
          callerName: name,
          ...(silent ? { silent: '1' } : {}),
        },
        call: true,
      },
      `c:${data.callId}`,
    );
    return 'sent';
  }

  private async dispatchNotification(
    data: NotificationJobData,
    jobId: string,
  ): Promise<DispatchResult> {
    const n = await this.prisma.notification.findUnique({
      where: { id: data.notificationId },
      select: {
        id: true,
        type: true,
        category: true,
        payload: true,
        read_at: true,
        user_id: true,
        user: {
          select: {
            ui_language: true,
            status: true,
            email: true,
            email_verified_at: true,
          },
        },
      },
    });
    if (!n) throw new NotificationNotCommittedError(data.notificationId);
    if (!n.user || n.user.status !== 'active') return 'no_user';

    if (!data.deferred) {
      this.realtime.toUsers([n.user_id], 'notification:new', {
        id: n.id,
        type: n.type,
      });
      await this.badges.notificationsChanged(n.user_id);
    }
    if (data.push === false) return 'no_push';
    // Audit 2026-10-02: read in the app while quiet hours held it → no push.
    if (data.deferred && n.read_at) return 'no_push';
    if (!(await this.pushAllowed(n.user_id, n.category))) return 'disabled';
    if (!data.deferred && !QUIET_EXEMPT.has(n.type)) {
      const until = await this.quietUntil(n.user_id);
      if (until) {
        await this.queue.defer(data, until, jobId || n.id);
        return 'deferred';
      }
    }

    const payload = (n.payload ?? {}) as Record<string, unknown>;
    // Owner 2026-09-30: an admin broadcast carries its own text.
    const text =
      n.type === 'admin_broadcast' &&
      typeof payload.title === 'string' &&
      typeof payload.body === 'string'
        ? { title: payload.title, body: payload.body }
        : await this.templates.render(n.type, n.user.ui_language);
    const deepLink: Record<string, string> = {
      notificationId: n.id,
      type: n.type,
    };
    for (const k of [
      'caseId',
      'bidId',
      'reportId',
      'postId',
      'commentId',
      'reviewId',
      // Owner 2026-10-02: a support reply opens the ticket.
      'ticketId',
    ]) {
      if (typeof payload[k] === 'string') deepLink[k] = payload[k];
    }
    const badge = (await this.badges.get(n.user_id)).total;
    await this.sender.send(
      { userId: n.user_id, ...text, data: deepLink, badge },
      `n:${n.id}`,
    );
    if (
      EMAIL_TYPES.has(n.type) &&
      n.user.email &&
      n.user.email_verified_at &&
      (await this.emailAllowed(n.user_id, n.category))
    ) {
      await this.sendEmailOnce(
        n.id,
        n.user.email,
        n.type,
        text,
        n.user.ui_language,
      );
    }
    return 'sent';
  }

  private async dispatchMessage(
    data: MessageJobData,
    jobId: string,
  ): Promise<DispatchResult> {
    const [user, part, message] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: data.recipientId },
        select: { status: true, ui_language: true },
      }),
      this.prisma.conversationParticipant.findUnique({
        where: {
          conversation_id_user_id: {
            conversation_id: data.conversationId,
            user_id: data.recipientId,
          },
        },
        select: {
          muted_until: true,
          last_read_message_id: true,
        },
      }),
      this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: {
          created_at: true,
          body_display: true,
          type: true,
          deleted_at: true,
          sent_by_name: true,
        },
      }),
    ]);
    if (!user || user.status !== 'active' || !part || !message) {
      return 'no_user';
    }
    if (message.deleted_at) return 'no_push';
    // Audit 2026-10-02: a push held by quiet hours is dropped when the
    // message was read in the meantime.
    if (data.deferred && part.last_read_message_id) {
      const lastRead = await this.prisma.message.findUnique({
        where: { id: part.last_read_message_id },
        select: { created_at: true },
      });
      if (lastRead && lastRead.created_at >= message.created_at) {
        return 'no_push';
      }
    }
    if (part.muted_until && part.muted_until > new Date()) return 'muted';
    if (await this.realtime.isViewing(data.recipientId, data.conversationId)) {
      return 'viewing';
    }
    if (!(await this.pushAllowed(data.recipientId, 'messages'))) {
      return 'disabled';
    }
    if (!data.deferred) {
      const until = await this.quietUntil(data.recipientId);
      if (until) {
        await this.queue.defer(data, until, jobId || data.messageId);
        return 'deferred';
      }
    }
    const text = await this.templates.render('new_message', user.ui_language);
    // OQ-040: a voice note has no text — say what it is.
    const ru = user.ui_language === 'ru';
    const caption = [...message.body_display]
      .slice(0, MESSAGE_PREVIEW_CHARS)
      .join('');
    const preview =
      message.type === 'voice'
        ? ru
          ? '🎤 Голосовое сообщение'
          : '🎤 Voice message'
        : // OQ-047: say what was attached; the file name stays private.
          message.type === 'attachment'
          ? (ru ? '📎 Файл' : '📎 File') + (caption ? `: ${caption}` : '')
          : // Owner 2026-10-01: a sticker.
            message.type === 'sticker'
            ? ru
              ? 'Стикер'
              : 'Sticker'
            : caption;
    // Owner 2026-10-01: an assistant's message says so (not who exactly).
    const from = message.sent_by_name
      ? ru
        ? 'Помощник адвоката: '
        : "Attorney's assistant: "
      : '';
    const badge = (await this.badges.get(data.recipientId)).total;
    await this.sender.send(
      {
        userId: data.recipientId,
        title: text.title,
        body: from + (preview || text.body),
        data: {
          type: 'new_message',
          conversationId: data.conversationId,
          messageId: data.messageId,
        },
        badge,
      },
      `m:${data.messageId}`,
    );
    return 'sent';
  }

  private async pushAllowed(
    userId: string,
    category: NotificationCategory,
  ): Promise<boolean> {
    if (LOCKED_CATEGORIES.has(category)) return true;
    const s = await this.prisma.notificationSetting.findUnique({
      where: { user_id_category: { user_id: userId, category } },
      select: { push_enabled: true },
    });
    return s ? s.push_enabled : DEFAULT_PUSH[category];
  }

  private async emailAllowed(
    userId: string,
    category: NotificationCategory,
  ): Promise<boolean> {
    if (LOCKED_CATEGORIES.has(category)) return true;
    const s = await this.prisma.notificationSetting.findUnique({
      where: { user_id_category: { user_id: userId, category } },
      select: { email_enabled: true },
    });
    return s ? s.email_enabled : true;
  }

  private async quietUntil(userId: string): Promise<Date | null> {
    const qh = await this.prisma.notificationQuietHours.findUnique({
      where: { user_id: userId },
    });
    return qh ? quietHoursEnd(new Date(), qh) : null;
  }

  /** One email per notification even if the push job is retried. */
  private async sendEmailOnce(
    notificationId: string,
    to: string,
    type: NotificationType,
    text: { title: string; body: string },
    locale?: string,
  ): Promise<void> {
    const claimed = await this.prisma.$executeRaw`
      UPDATE notifications SET payload = payload || '{"emailed":true}'::JSONB
      WHERE id = ${notificationId}::UUID
        AND NOT (payload ? 'emailed')`;
    if (claimed === 0) return;
    try {
      await this.costGuard?.consume('email');
    } catch {
      // Over budget: the in-app notification and push still went out.
      this.logger.warn({ notificationId, type }, 'email skipped: budget');
      return;
    }
    try {
      // Owner 2026-10-02: `notification` template (admin-editable).
      await this.email.sendEmail(
        buildNotificationEmail({ email: to, ...text, locale }),
      );
    } catch (error) {
      this.logger.warn(
        {
          notificationId,
          type,
          err: error instanceof Error ? error.message : error,
        },
        'notification email failed',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
