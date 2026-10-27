import {
  ServerTextsService,
  fillVars,
} from '../../../common/i18n/server-texts.service';
import { ApnsVoipSender } from './apns-voip.sender';
import { VoipTokensService } from './voip-tokens.service';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { emailFlowsOn } from '../../feature-flags/email-flows';
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
import { parseQueueMode } from '../../../common/queues/queue-hardening';
import type { QueueMode } from '../../../common/queues/queue-mode';
import { PinoLogger } from 'nestjs-pino';
import { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EmailProvider } from '../../auth/providers/email/email-provider.interface';
import { buildNotificationEmail } from '../../auth/notifications/email-templates';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { BadgesService } from '../badges.service';
import {
  ALWAYS_PUSH,
  DEFAULT_PUSH,
  EMAIL_TYPES,
  LOCKED_CATEGORIES,
  quietHoursApply,
  quietHoursEnd,
} from '../notification-rules';
import { topicOf } from '../notification-topics';
import { NotificationTemplateService } from './notification-template.service';
import { fillTemplate } from './notification-templates';
import { PushQueueService } from './push-queue.service';
import { FcmRateLimitError, inChunks } from './fcm-push.sender';
import {
  NOTIFICATION_EMAIL,
  PUSH_MODULE_OPTIONS,
  PUSH_QUEUE,
  PUSH_SENDER,
  type GroupMessagesJobData,
  type OpsAlertJobData,
  type MessageJobData,
  type PushMessage,
  type CallJobData,
  type NotificationJobData,
  type PushJobData,
  type PushSender,
} from './push.constants';
import { MessageBodyCipher } from '../../../common/secrets/message-body-cipher';
import { viewerContext } from '../../../common/viewer/viewer-context';
import { FilesService } from '../../files/files.service';
import {
  CHAT_SENDER_SELECT,
  chatCollapseKey,
  chatPushData,
  chatPushKind,
  chatPushPreview,
  chatSenderName,
  PUSH_TEXT_KEYS,
  type PushTextName,
} from './chat-push';
import { bullOptions } from '../../../redis/redis-connection';
import { pushActionKey, signPushAction } from './push-action-token';
import { actorPushData, CHAT_CATEGORY } from './actor-push';
import {
  closeWorker,
  workerTuning,
} from '../../../common/queues/queue-hardening';

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

/** Members of a `group_messages` job checked at the same time. */
const GROUP_PREPARE_CONCURRENCY = 25;

/** A group message, its group and sender — read once per batch. */
interface GroupShared {
  message: Awaited<ReturnType<PushDispatcher['groupMessageRow']>>;
  group: Awaited<ReturnType<PushDispatcher['groupRow']>>;
  sender: Awaited<ReturnType<PushDispatcher['chatSender']>>;
}

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
    @Optional() private readonly cipher?: MessageBodyCipher,
    @Optional() private readonly flags?: FeatureFlagsService,
    // Owner 2026-10-17: iPhone calls as VoIP (PushKit) pushes.
    @Optional() private readonly voip?: ApnsVoipSender,
    @Optional() private readonly voipTokens?: VoipTokensService,
    // Owner 2026-10-22: the sender's photo on a message push (WhatsApp).
    @Optional() private readonly files?: FilesService,
    // Owner 2026-10-22 (audit #4 §4): push words in every app language.
    @Optional() private readonly texts?: ServerTextsService,
    // S3-11: `push.chat_preview` (off = no message text in a push);
    // S10-5: admin «queues.push_rate_*» (three-state limiter).
    @Optional() private readonly appSettings?: AppSettingsService,
  ) {
    this.logger.setContext(PushDispatcher.name);
  }

  private rateMode: QueueMode = 'auto';
  private rateTimer?: NodeJS.Timeout;

  /** Reads the admin push-rate switch and applies it to the live worker
   * (BullMQ reads `opts.limiter` on every fetch). off = no limit. */
  async applyRatePolicy(): Promise<void> {
    if (!this.appSettings) return;
    try {
      this.rateMode = parseQueueMode(
        await this.appSettings.string('queues.push_rate_mode'),
      );
      const perSec = await this.appSettings.number('queues.push_rate_per_sec');
      if (this.worker) {
        this.worker.opts.limiter =
          this.rateMode === 'off'
            ? undefined
            : { max: Math.max(1, perSec), duration: 1000 };
      }
    } catch {
      // keep the last policy; a settings hiccup must not stop pushes
    }
  }

  /** The worker body: dispatches one job; an FCM 429 pauses the WHOLE queue
   * for the time FCM asked (auto mode) and puts the job back without using
   * up one of its attempts (BullMQ `Worker.RateLimitError`). */
  async processJob(job: Job<PushJobData>): Promise<DispatchResult> {
    try {
      return await this.dispatch(job.data, job.id ?? '');
    } catch (error) {
      if (error instanceof FcmRateLimitError && this.rateMode === 'auto') {
        this.logger.warn(
          { retryAfterMs: error.retryAfterMs },
          'fcm rate limited: push queue paused',
        );
        await this.queue.pauseFor(error.retryAfterMs);
        throw Worker.RateLimitError();
      }
      throw error;
    }
  }

  /** Per-conversation chat collapse (chat-push.ts chatCollapseKey) is opt-in:
   * FCM keeps at most 4 collapse keys per offline device and advises against
   * collapsing chat, so it could drop alerts. PUSH_CHAT_COLLAPSE=1 turns it on. */
  private chatCollapse(): boolean {
    return process.env.PUSH_CHAT_COLLAPSE === '1';
  }

  private actionKeyCache?: Buffer | null;

  /** Owner 2026-10-26: the signed ticket behind a chat notification's
   * «Ответить» / «Прочитано» buttons (push-action-token.ts); none without
   * the pepper (then the buttons are simply not shown). */
  private actionToken(
    recipientId: string,
    chatId: string,
    group: boolean,
  ): Record<string, string> {
    if (this.actionKeyCache === undefined) {
      let pepper: string | undefined;
      try {
        pepper = this.config.get<string>('AUTH_EVENT_PEPPER');
      } catch {
        pepper = undefined;
      }
      this.actionKeyCache = pepper ? pushActionKey(pepper) : null;
    }
    if (!this.actionKeyCache) return {};
    return {
      actionToken: signPushAction(this.actionKeyCache, {
        u: recipientId,
        c: chatId,
        g: group ? 1 : 0,
      }),
    };
  }

  /** The push words in [lang] (the app's own 85-language keys; built-in
   * en / ru until the translations are imported). */
  private async pushTexts(
    lang: string | null | undefined,
  ): Promise<Record<PushTextName, string>> {
    if (this.texts) return this.texts.texts(lang, PUSH_TEXT_KEYS);
    const ru = (lang ?? '').startsWith('ru');
    return Object.fromEntries(
      Object.entries(PUSH_TEXT_KEYS).map(([k, [, fb]]) => [
        k,
        ru ? fb.ru : fb.en,
      ]),
    ) as Record<PushTextName, string>;
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
      (job: Job<PushJobData>) => this.processJob(job),
      {
        ...bullOptions(PUSH_QUEUE, url, { worker: true }),
        ...workerTuning(PUSH_QUEUE),
        concurrency: 20,
        // S10-5: ceiling under FCM's 10 000/s project quota; the admin
        // switch refreshes it every minute.
        limiter: { max: 8000, duration: 1000 },
      },
    );
    void this.applyRatePolicy();
    this.rateTimer = setInterval(() => void this.applyRatePolicy(), 60_000);
    this.rateTimer.unref();
    this.worker.on('error', (error) => {
      this.logger.error({ err: error.message }, 'push worker error');
    });
  }

  /** Returns what happened (tests, dashboards). */
  async dispatch(data: PushJobData, jobId: string): Promise<DispatchResult> {
    if (data.kind === 'ops_alert') return this.dispatchOpsAlert(data);
    if (data.kind === 'call') return this.dispatchCall(data);
    if (data.kind === 'call_end') {
      // Never held by settings or quiet hours: it only silences a ring.
      await this.sender.send(
        {
          userId: data.recipientId,
          title: '',
          body: '',
          data: {
            type: 'call_ended',
            callId: data.callId,
            ...(data.ended ? { ended: '1' } : {}),
          },
          callEnd: true,
        },
        `ce:${data.callId}${data.ended ? ':end' : ''}`,
      );
      return 'sent';
    }
    if (data.kind === 'group_messages') return this.dispatchGroupMessages(data);
    return data.kind === 'message'
      ? this.dispatchMessage(data, jobId)
      : this.dispatchNotification(data, jobId);
  }

  /** S3-11: with `push.chat_preview` off a chat push never carries the
   * message text (Google / Apple see only «New message» or the kind of
   * attachment). On by default = today's behaviour. */
  private async chatPreviewOn(): Promise<boolean> {
    try {
      return (await this.appSettings?.boolean('push.chat_preview')) ?? true;
    } catch {
      return true;
    }
  }

  /** Owner 2026-10-22: an on-call alert. An admin who switched «дежурный»
   * on wants it at night too, so no quiet hours and no category switch; the
   * e-mail leg counts against the e-mail budget like any other mail. */
  private async dispatchOpsAlert(
    data: OpsAlertJobData,
  ): Promise<DispatchResult> {
    await this.sender.send(
      {
        userId: data.recipientId,
        title: data.title,
        body: data.body,
        data: {
          type: 'ops_alert',
          incidentId: data.incidentId,
          event: data.event,
        },
        sound: 'notification',
        collapseKey: `ops:${data.incidentId}`,
      },
      `ops:${data.incidentId}:${data.event}:${data.recipientId}`,
    );
    if (data.email) {
      const user = await this.prisma.user.findUnique({
        where: { id: data.recipientId },
        select: { email: true, ui_language: true },
      });
      if (user?.email) {
        try {
          await this.costGuard?.consume('email');
          await this.email.sendEmail(
            buildNotificationEmail({
              email: user.email,
              title: data.title,
              body: data.body,
              locale: user.ui_language,
            }),
          );
        } catch (error) {
          this.logger.warn(
            {
              incidentId: data.incidentId,
              err: error instanceof Error ? error.message : error,
            },
            'ops alert email skipped',
          );
        }
      }
    }
    return 'sent';
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
        group_id: true,
        video: true,
        is_group: true,
        caller_id: true,
        callee: { select: { status: true, ui_language: true } },
        caller: {
          select: { first_name: true, last_name: true, avatar_file_id: true },
        },
        // Group calls: a person added to a running call.
        participants: {
          where: { user_id: data.recipientId, status: 'invited' },
          select: {
            invited_by_id: true,
            invited_by: {
              select: {
                first_name: true,
                last_name: true,
                avatar_file_id: true,
              },
            },
            user: { select: { status: true, ui_language: true } },
          },
        },
      },
    });
    if (!call) return 'no_user';
    const invite = call.is_group ? call.participants[0] : undefined;
    if (invite) {
      if (invite.user.status !== 'active') return 'no_user';
      if (call.status !== 'active') return 'no_push';
    } else {
      if (call.callee.status !== 'active') return 'no_user';
      if (call.status !== 'ringing') return 'no_push';
    }
    const language = invite ? invite.user.ui_language : call.callee.ui_language;
    // Owner 2026-10-21 (Telegram): a call started in a group chat does not
    // ring like a phone call — a light notification «X started a call ·
    // Join», and the same for being invited into it. No ringtone, no
    // CallKit / VoIP push.
    if (call.group_id) {
      // Owner 2026-10-21: «mute calls» of the group silences this too.
      if (await this.callsMutedFor(data.recipientId, call)) return 'no_push';
      // Owner 2026-10-21 (inbox 30): «Calls» off — no «Join» notice (it
      // is not a ringing call to me; the call stays in the group's list).
      if (!(await this.pushAllowed(data.recipientId, 'calls'))) {
        return 'disabled';
      }
      return this.dispatchGroupCallNotice(data, call, invite, language);
    }
    // Owner 2026-10-02: calls switched off still come through — silently
    // (no ringtone), so a call is never lost.
    // Owner 2026-10-21: «mute calls» of this chat / group does the same.
    const silent =
      !(await this.pushAllowed(data.recipientId, 'calls')) ||
      (await this.callsMutedFor(data.recipientId, call));
    const who = invite?.invited_by ?? call.caller;
    const name =
      [who.first_name, who.last_name].filter(Boolean).join(' ') || 'LawBid';
    // Owner 2026-10-26 (calls arrived without the caller's photo when the
    // app was closed / the screen locked): the ring carries the photo link
    // (the 256 px public CDN copy, as the recipient may see it), so the
    // system call screen shows it without asking the server first.
    const pics = await this.avatarUrls(data.recipientId, [who.avatar_file_id]);
    const avatarUrl = pics.get(who.avatar_file_id ?? '') ?? null;
    // Owner 2026-10-17: iPhones with a VoIP token ring through Apple
    // directly (CallKit, even when the app is closed); their FCM call push
    // is skipped so they don't ring twice.
    const rang =
      (await this.voip?.ringCall(data.recipientId, {
        callId: data.callId,
        conversationId: call.conversation_id ?? '',
        callerName: name,
        avatarUrl,
        video: call.video,
        silent,
      })) ?? [];
    const skipTokens = rang.length
      ? ((await this.voipTokens?.fcmTokensCoveredBy(rang)) ?? [])
      : [];
    const t = await this.pushTexts(language);
    await this.sender.send(
      {
        userId: data.recipientId,
        title: name,
        // Owner 2026-10-05: video calls say so. Owner 2026-10-22 (audit
        // #4 §4): in the person's language.
        body: call.video ? `📹 ${t.videoCall}` : `📞 ${t.incomingCall}`,
        data: {
          type: 'incoming_call',
          callId: data.callId,
          conversationId: call.conversation_id ?? '',
          callerName: name,
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(silent ? { silent: '1' } : {}),
          ...(call.video ? { video: '1' } : {}),
        },
        call: true,
        skipTokens,
      },
      `c:${data.callId}`,
    );
    return 'sent';
  }

  private async dispatchGroupCallNotice(
    data: CallJobData,
    call: {
      group_id: string | null;
      caller_id: string;
      video: boolean;
      caller: { first_name: string | null; last_name: string | null };
    },
    invite:
      | {
          invited_by_id: string | null;
          invited_by: {
            first_name: string | null;
            last_name: string | null;
          } | null;
        }
      | undefined,
    language: string | null,
  ): Promise<DispatchResult> {
    const group = await this.prisma.chatGroup.findUnique({
      where: { id: call.group_id ?? '' },
      select: { title: true },
    });
    const who = invite?.invited_by ?? call.caller;
    const name =
      [who.first_name, who.last_name].filter(Boolean).join(' ') || 'LawBid';
    // Owner 2026-10-22 (audit #4 §4): «Kim · 📞 Ongoing call · Join» in
    // the person's language (the app's own call texts).
    const t = await this.pushTexts(language);
    const body = `${name} · ${
      call.video ? `📹 ${t.videoCall}` : `📞 ${t.ongoingCall}`
    } · ${t.join}`;
    await this.sender.send(
      {
        userId: data.recipientId,
        title: group?.title ?? name,
        body,
        // About a minute in the shade, then gone (owner 2026-10-21); the
        // call-end push takes it away sooner. One per call (tag).
        ttlSec: 60,
        collapseKey: `gc:${data.callId}`,
        sound: 'notification',
        data: {
          type: 'group_call',
          callId: data.callId,
          groupId: call.group_id ?? '',
          callerName: name,
          groupTitle: group?.title ?? '',
          ...(call.video ? { video: '1' } : {}),
        },
      },
      `gc:${data.callId}`,
    );
    return 'sent';
  }

  /** The recipient muted the calls of the chat / group this call is from. */
  private async callsMutedFor(
    userId: string,
    call: { conversation_id: string | null; group_id: string | null },
  ): Promise<boolean> {
    if (call.group_id) {
      const m = await this.prisma.chatGroupMember.findUnique({
        where: {
          group_id_user_id: { group_id: call.group_id, user_id: userId },
        },
        select: { calls_muted: true },
      });
      return m?.calls_muted ?? false;
    }
    if (!call.conversation_id) return false;
    const p = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: call.conversation_id,
          user_id: userId,
        },
      },
      select: { calls_muted: true },
    });
    return p?.calls_muted ?? false;
  }

  private async dispatchNotification(
    data: NotificationJobData,
    jobId: string,
  ): Promise<DispatchResult> {
    const n = await this.prisma.notification.findFirst({
      where: {
        id: data.notificationId,
        ...(data.userId ? { user_id: data.userId } : {}),
      },
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
            timezone: true,
            quiet_hours: { select: { timezone: true } },
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
    // Owner 2026-10-21 (inbox 30): the switch of this very kind.
    if (
      !ALWAYS_PUSH.has(n.type) &&
      !(await this.badges.topicSwitches(n.user_id)).on(
        topicOf(n.type, n.payload as Record<string, unknown> | null),
      )
    ) {
      return 'disabled';
    }
    if (
      !data.deferred &&
      quietHoursApply(
        n.type,
        (await this.appSettings?.boolean('case_alerts.urgent_fast_enabled')) ??
          APP_SETTINGS['case_alerts.urgent_fast_enabled'],
      )
    ) {
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
        : fillTemplate(
            await this.templates.renderFor(
              n.type,
              payload,
              n.user.ui_language,
              n.user.timezone ?? n.user.quiet_hours?.timezone ?? 'UTC',
            ),
            payload,
          );
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
      // Audit 2026-10-04: chats, assistant requests/tasks open their screen.
      'conversationId',
      'kind',
      'requestId',
      'taskId',
      // Owner 2026-10-20: the planner reminder — when it is for.
      'remindAt',
      'dueAt',
    ]) {
      if (typeof payload[k] === 'string') deepLink[k] = payload[k];
    }
    if (payload.missed === true) deepLink.missed = '1';
    // Owner 2026-10-20 (like WhatsApp): a missed call shows who called —
    // the caller's name on top, "Missed call" below.
    let shown = text;
    // Owner 2026-10-26 (WhatsApp / Instagram): who did it — their name and
    // photo on the notification. Same rule as the bell list: an attorney
    // by public profile; a client stays anonymous (no name, no photo).
    const actor =
      typeof payload.actorId === 'string'
        ? await this.prisma.user.findUnique({
            where: { id: payload.actorId },
            select: { role: true, ...CHAT_SENDER_SELECT },
          })
        : null;
    if (n.type === 'missed_call' && actor) {
      const caller = [actor.first_name, actor.last_name]
        .filter(Boolean)
        .join(' ');
      if (caller) shown = { title: caller, body: text.title };
    }
    let actorData: Record<string, string> = {};
    // A planner reminder keeps its own alarm-style alert.
    if (actor?.role === 'attorney' && n.type !== 'task_reminder') {
      const pics = await this.avatarUrls(n.user_id, [actor.avatar_file_id]);
      actorData = actorPushData({
        name: chatSenderName(actor),
        avatar: pics.get(actor.avatar_file_id ?? '') ?? null,
        avatarKey: actor.avatar_file_id ?? null,
      });
    }
    const icon = await this.badges.iconFor(n.user_id);
    await this.sender.send(
      {
        userId: n.user_id,
        ...shown,
        data: { ...deepLink, ...actorData },
        badge: icon.badge,
        ...(icon.on ? {} : { iconBadge: false }),
        sound: 'notification',
        ...(n.type === 'task_reminder' ? { reminder: true } : {}),
        // Drawn by the app with the photo (Android), the photo attached by
        // the notification extension (iPhone).
        ...(actorData.style ? { actor: true } : {}),
      },
      `n:${n.id}`,
    );
    if (
      EMAIL_TYPES.has(n.type) &&
      n.user.email &&
      n.user.email_verified_at &&
      (await this.emailAllowed(n.user_id, n.category)) &&
      // Admin «Вход и письма по почте» off: push and in-app only.
      (await emailFlowsOn(this.flags))
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

  /**
   * Owner 2026-10-20: a group chat message. Same gates as a 1:1 message
   * (active user, still a member, muted, chat open, setting, quiet hours);
   * a system line only pushes to the person just added; @mentioned members
   * get a push even while the group is muted.
   */
  private async dispatchGroupMessage(
    data: MessageJobData & { groupId: string },
    jobId: string,
  ): Promise<DispatchResult> {
    const r = await this.prepareGroupMessage(data, jobId);
    if (r.push) await this.sender.send(r.push, `m:${data.messageId}`);
    return r.result;
  }

  /**
   * Owner 2026-10-22 (server load audit, finding 7): one group message for
   * up to 500 members. The message, the group and the sender are read once;
   * each member goes through the same gates as [dispatchGroupMessage]
   * (GROUP_PREPARE_CONCURRENCY at a time); the pushes then go out together
   * (PushSender.sendMany: devices in parallel, FCM multicast-sized chunks).
   * It used to be one queued job per member, one device at a time — and
   * those jobs shared the id `m-<message>`, so BullMQ kept only the first.
   */
  private async dispatchGroupMessages(
    data: GroupMessagesJobData,
  ): Promise<DispatchResult> {
    const [message, group] = await Promise.all([
      this.groupMessageRow(data.messageId, data.groupId),
      this.groupRow(data.groupId),
    ]);
    if (!message || !group || group.deleted_at) return 'no_user';
    if (message.deleted_at) return 'no_push';
    const sender =
      message.type !== 'system' && message.sender_id
        ? await this.chatSender(message.sender_id)
        : null;
    const shared: GroupShared = { message, group, sender };
    const pushes: PushMessage[] = [];
    await inChunks(
      data.recipientIds,
      GROUP_PREPARE_CONCURRENCY,
      async (recipientId) => {
        const r = await this.prepareGroupMessage(
          {
            kind: 'message',
            recipientId,
            conversationId: data.groupId,
            messageId: data.messageId,
            groupId: data.groupId,
          },
          // A member held by quiet hours gets their own deferred job.
          `gm-${data.messageId}-${recipientId}`,
          shared,
        );
        if (r.push) pushes.push(r.push);
      },
    );
    if (pushes.length === 0) return 'no_push';
    const dedupeKey = `m:${data.messageId}`;
    if (this.sender.sendMany) {
      await this.sender.sendMany(pushes, dedupeKey);
    } else {
      for (const push of pushes) await this.sender.send(push, dedupeKey);
    }
    return 'sent';
  }

  groupMessageRow(messageId: string, groupId?: string) {
    return this.prisma.chatGroupMessage.findFirst({
      where: {
        id: messageId,
        ...(groupId ? { group_id: groupId } : {}),
        deleted_at: {},
      },
      select: {
        body: true,
        type: true,
        sender_id: true,
        deleted_at: true,
        system_kind: true,
        system_payload: true,
        mention_ids: true,
        created_at: true,
        file: { select: { mime: true } },
        poll: { select: { question: true } },
      },
    });
  }

  groupRow(groupId: string) {
    return this.prisma.chatGroup.findUnique({
      where: { id: groupId },
      select: { title: true, deleted_at: true, avatar_file_id: true },
    });
  }

  chatSender(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: CHAT_SENDER_SELECT,
    });
  }

  /** The gates of one member and their push ([shared]: read once per
   * batch). */
  private async prepareGroupMessage(
    data: MessageJobData & { groupId: string },
    jobId: string,
    shared?: GroupShared,
  ): Promise<{ result: DispatchResult; push?: PushMessage }> {
    const [user, member, message, group] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: data.recipientId },
        select: { status: true, ui_language: true, first_name: true },
      }),
      this.prisma.chatGroupMember.findUnique({
        where: {
          group_id_user_id: {
            group_id: data.groupId,
            user_id: data.recipientId,
          },
        },
        select: { muted_until: true, left_at: true },
      }),
      shared
        ? shared.message
        : this.groupMessageRow(data.messageId, data.groupId),
      shared ? shared.group : this.groupRow(data.groupId),
    ]);
    if (
      !user ||
      user.status !== 'active' ||
      !member ||
      member.left_at ||
      !message ||
      !group ||
      group.deleted_at
    ) {
      return { result: 'no_user' };
    }
    if (message.deleted_at) return { result: 'no_push' };
    const t = await this.pushTexts(user.ui_language);
    const mentioned = message.mention_ids.includes(data.recipientId);
    let body: string;
    // Owner 2026-10-22: who wrote it, their photo and the bare text, for the
    // app's own notification (Android MessagingStyle shows each sender).
    let chat: Record<string, string> | undefined;
    if (message.type === 'system') {
      const payload = (message.system_payload ?? {}) as {
        targetIds?: string[];
      };
      if (
        message.system_kind !== 'added' ||
        !payload.targetIds?.includes(data.recipientId)
      ) {
        return { result: 'no_push' };
      }
      const adder = message.sender_id
        ? chatSenderName(await this.chatSender(message.sender_id))
        : '';
      body = fillVars(t.added, {
        name: adder || 'LawBid',
        people: user.first_name?.trim() || '@',
      });
    } else {
      const sender = shared
        ? shared.sender
        : message.sender_id
          ? await this.chatSender(message.sender_id)
          : null;
      // Owner 2026-10-22: the display name, else the @username.
      const who = chatSenderName(sender);
      const previewOn = await this.chatPreviewOn();
      const caption = previewOn
        ? [
            ...(message.type === 'poll'
              ? (message.poll?.question ?? '')
              : message.body),
          ]
            .slice(0, MESSAGE_PREVIEW_CHARS)
            .join('')
        : '';
      const kind = chatPushKind(message.type, message.file?.mime);
      let preview = chatPushPreview(kind, caption, t);
      if (!preview) {
        preview = (await this.templates.render('new_message', user.ui_language))
          .body;
      }
      if (mentioned) {
        preview = `@ ${fillVars(t.mentioned, { name: who || '' }).trim()}. ${preview}`;
      }
      // Telegram: the group on top, «Имя: текст» below.
      body = (who ? `${who}: ` : '') + preview;
      const pics = await this.avatarUrls(data.recipientId, [
        sender?.avatar_file_id,
        group.avatar_file_id,
      ]);
      chat = chatPushData({
        senderId: message.sender_id,
        senderName: who,
        senderAvatar: pics.get(sender?.avatar_file_id ?? '') ?? null,
        senderAvatarKey: sender?.avatar_file_id ?? null,
        text: preview,
        kind,
        sentAt: message.created_at,
        group: {
          title: group.title,
          avatar: pics.get(group.avatar_file_id ?? '') ?? null,
          avatarKey: group.avatar_file_id,
        },
      });
    }
    const muted = !!member.muted_until && member.muted_until > new Date();
    if (muted && !mentioned) return { result: 'muted' };
    if (await this.realtime.isViewing(data.recipientId, data.groupId)) {
      return { result: 'viewing' };
    }
    // Owner 2026-10-21: groups have their own switch (Telegram); an
    // @mention follows «Mentions» (inbox 30).
    const sw = await this.badges.topicSwitches(data.recipientId);
    if (
      !(mentioned && sw.on('chatMentions')) &&
      !(sw.on('groups') && !(mentioned && muted))
    ) {
      return { result: 'disabled' };
    }
    if (!data.deferred) {
      const until = await this.quietUntil(data.recipientId);
      if (until) {
        await this.queue.defer(data, until, jobId || data.messageId);
        return { result: 'deferred' };
      }
    }
    const icon = await this.badges.iconFor(data.recipientId);
    return {
      result: 'sent',
      push: {
        userId: data.recipientId,
        title: group.title,
        body,
        data: {
          type: 'new_message',
          groupId: data.groupId,
          conversationId: data.groupId,
          messageId: data.messageId,
          ...chat,
          // Owner 2026-10-26: «Ответить» / «Прочитано» on the notification.
          ...(chat
            ? this.actionToken(data.recipientId, data.groupId, true)
            : {}),
        },
        badge: icon.badge,
        ...(icon.on ? {} : { iconBadge: false }),
        sound: 'message',
        // One stack per chat in the shade (WhatsApp).
        threadId: data.groupId,
        ...(this.chatCollapse()
          ? {
              collapseKey: chatCollapseKey(data.groupId, {
                mention: mentioned,
              }),
            }
          : {}),
        ...(chat ? { chat: true, iosCategory: CHAT_CATEGORY } : {}),
      },
    };
  }

  private async dispatchMessage(
    data: MessageJobData,
    jobId: string,
  ): Promise<DispatchResult> {
    if (data.groupId) {
      return this.dispatchGroupMessage(
        { ...data, groupId: data.groupId },
        jobId,
      );
    }
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
        where: {
          id_conversation_id: {
            id: data.messageId,
            conversation_id: data.conversationId,
          },
        },
        select: {
          created_at: true,
          body_display: true,
          type: true,
          duration_ms: true,
          deleted_at: true,
          revoked_at: true,
          sender_id: true,
          sent_by_name: true,
          file: { select: { mime: true } },
        },
      }),
    ]);
    if (!user || user.status !== 'active' || !part || !message) {
      return 'no_user';
    }
    if (message.deleted_at || message.revoked_at) return 'no_push';
    // Owner 2026-10-20: an edit only refreshes the alert of a message the
    // recipient has not read yet (it replaces it); a read one stays quiet.
    if (data.event === 'edit') {
      if (part.last_read_message_id) {
        const lastRead = await this.prisma.message.findUnique({
          where: {
            id_conversation_id: {
              id: part.last_read_message_id,
              conversation_id: data.conversationId,
            },
          },
          select: { created_at: true },
        });
        if (lastRead && lastRead.created_at >= message.created_at) {
          return 'no_push';
        }
      }
    }
    // Audit 2026-10-02: a push held by quiet hours is dropped when the
    // message was read in the meantime.
    if (data.deferred && part.last_read_message_id) {
      const lastRead = await this.prisma.message.findUnique({
        where: {
          id_conversation_id: {
            id: part.last_read_message_id,
            conversation_id: data.conversationId,
          },
        },
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
    // Owner 2026-10-21 (inbox 30): «Reactions» off silences reactions to
    // my messages too (not set yet = as before).
    if (
      data.event === 'reaction' &&
      (await this.badges.topicSwitches(data.recipientId)).raw.reactions ===
        false
    ) {
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
    const t = await this.pushTexts(user.ui_language);
    const caption = (await this.chatPreviewOn())
      ? [
          ...(this.cipher?.open(message.body_display, data.messageId) ??
            message.body_display),
        ]
          .slice(0, MESSAGE_PREVIEW_CHARS)
          .join('')
      : '';
    // Owner 2026-10-22: «📷 Фото» / «🎥 Видео» / «📎 Файл» / «🎤 …».
    const kind = chatPushKind(message.type, message.file?.mime);
    const preview = chatPushPreview(kind, caption, t, message.duration_ms);
    // Owner 2026-10-01: an assistant's message says so (not who exactly).
    const from = message.sent_by_name ? `${t.assistant}: ` : '';
    const icon = await this.badges.iconFor(data.recipientId);
    let body = from + (preview || text.body);
    let collapseKey: string | undefined;
    let dedupeKey = `m:${data.messageId}`;
    // Owner 2026-10-22 (WhatsApp): the push is titled with the person — the
    // one who wrote, or who reacted.
    const senderId =
      data.event === 'reaction' && data.actorId
        ? data.actorId
        : message.sender_id;
    const sender = senderId
      ? await this.prisma.user.findUnique({
          where: { id: senderId },
          select: CHAT_SENDER_SELECT,
        })
      : null;
    const who = chatSenderName(sender);
    if (data.event === 'edit') {
      // Same group as the message's own alert: it is rewritten in place.
      body = `✏️ ${body}`;
      collapseKey = `msg-${data.messageId}`;
      dedupeKey = `e:${data.messageId}`;
    } else if (data.event === 'reaction' && data.actorId) {
      const name = sender?.first_name?.trim() || who || 'LawBid';
      const quoted = preview ? ` «${[...preview].slice(0, 40).join('')}»` : '';
      // Owner 2026-10-22 (audit #4 §4): «Kim: Reaction 👍 «text»».
      body = `${name}: ${fillVars(t.reaction, { emoji: data.emoji ?? '' })}${quoted}`;
      collapseKey = `react-${data.messageId}`;
      dedupeKey = `r:${data.messageId}:${data.actorId}:${data.emoji ?? ''}`;
    } else {
      // Owner 2026-10-24: a burst replaces itself, the newest text wins.
      collapseKey = this.chatCollapse()
        ? chatCollapseKey(data.conversationId)
        : `msg-${data.messageId}`;
    }
    const pics = await this.avatarUrls(data.recipientId, [
      sender?.avatar_file_id,
    ]);
    const chat = chatPushData({
      senderId,
      senderName: who,
      senderAvatar: pics.get(sender?.avatar_file_id ?? '') ?? null,
      senderAvatarKey: sender?.avatar_file_id ?? null,
      text: body,
      kind,
      sentAt: message.created_at,
    });
    await this.sender.send(
      {
        userId: data.recipientId,
        title: who || text.title,
        body,
        data: {
          type: 'new_message',
          conversationId: data.conversationId,
          messageId: data.messageId,
          ...(data.event ? { event: data.event } : {}),
          ...chat,
          // Owner 2026-10-26: «Ответить» / «Прочитано» on the notification.
          ...this.actionToken(data.recipientId, data.conversationId, false),
        },
        badge: icon.badge,
        ...(icon.on ? {} : { iconBadge: false }),
        sound: 'message',
        collapseKey,
        // One stack per chat in the shade (WhatsApp).
        threadId: data.conversationId,
        chat: true,
        iosCategory: CHAT_CATEGORY,
      },
      dedupeKey,
    );
    return 'sent';
  }

  /**
   * Owner 2026-10-22: avatar file id → a link to its 256 px picture, as
   * [recipientId] may see it (a photo hidden from them stays hidden). A
   * picture never holds a message back: no files service or a storage
   * error just means no photo.
   */
  private async avatarUrls(
    recipientId: string,
    fileIds: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const files = this.files;
    if (!files || !fileIds.some(Boolean)) return out;
    try {
      const links = await viewerContext.run(recipientId, () =>
        files.avatarUrlsMany(fileIds),
      );
      for (const [id, link] of links) {
        const url = link.url256 ?? link.url;
        if (url) out.set(id, url);
      }
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : error },
        'push avatar skipped',
      );
    }
    return out;
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
    if (this.rateTimer) clearInterval(this.rateTimer);
    await closeWorker(this.worker);
  }
}
