import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationTemplateService } from './notification-template.service';
import {
  PUSH_MODULE_OPTIONS,
  PUSH_QUEUE,
  PUSH_SENDER,
  type PushJobData,
  type PushSender,
} from './push.constants';

export interface PushModuleOptions {
  mode: 'api' | 'worker';
}

/** Not committed yet (or rolled back): BullMQ retries, then drops it. */
export class NotificationNotCommittedError extends Error {}

/**
 * Consumer of the `push` queue: reads the committed notification, honours
 * the recipient's per-category push setting (docs/05 §9.5, default on),
 * localizes the text by `users.ui_language` and hands it to the sender.
 * Quiet hours, muted chats and FCM tokens are docs/05.
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
    private readonly logger: PinoLogger,
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
      (job: Job<PushJobData>) => this.dispatch(job.data.notificationId),
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 20 },
    );
    this.worker.on('error', (error) => {
      this.logger.error({ err: error.message }, 'push worker error');
    });
  }

  /** Returns what happened (tests, dashboards). */
  async dispatch(
    notificationId: string,
  ): Promise<'sent' | 'disabled' | 'no_user'> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        type: true,
        category: true,
        payload: true,
        user_id: true,
        user: { select: { ui_language: true, status: true } },
      },
    });
    if (!n) throw new NotificationNotCommittedError(notificationId);
    if (!n.user || n.user.status !== 'active') return 'no_user';
    const setting = await this.prisma.notificationSetting.findUnique({
      where: { user_id_category: { user_id: n.user_id, category: n.category } },
      select: { push_enabled: true },
    });
    if (setting && !setting.push_enabled) return 'disabled';

    const text = await this.templates.render(n.type, n.user.ui_language);
    const data: Record<string, string> = {
      notificationId: n.id,
      type: n.type,
    };
    const payload = (n.payload ?? {}) as Record<string, unknown>;
    for (const k of ['caseId', 'bidId', 'reportId']) {
      if (typeof payload[k] === 'string') data[k] = payload[k];
    }
    await this.sender.send({ userId: n.user_id, ...text, data });
    return 'sent';
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
