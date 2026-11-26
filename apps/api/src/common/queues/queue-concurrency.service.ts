import {
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  QUEUE_CONCURRENCY_RECHECK_MS,
  applyQueueConcurrency,
} from './queue-concurrency';

/**
 * THIRD_PASS_A Q5 (26.11): applies the admin settings
 * `ops.queue_concurrency_<queue>` to every queue worker of this process
 * (API and worker alike) every 30 s (queue-concurrency.ts).
 */
@Injectable()
export class QueueConcurrencyService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly log = new Logger(QueueConcurrencyService.name);
  private timer?: NodeJS.Timeout;

  constructor(@Optional() private readonly settings?: AppSettingsService) {}

  onApplicationBootstrap(): void {
    if (!this.settings) return;
    // The runners start their workers in their own bootstrap hooks: the
    // first pass waits for them, then every recheck.
    setImmediate(() => void this.tick());
    this.timer = setInterval(
      () => void this.tick(),
      QUEUE_CONCURRENCY_RECHECK_MS,
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; never throws. @internal exposed for the spec */
  async tick(): Promise<void> {
    const settings = this.settings;
    if (!settings) return;
    try {
      const changes = await applyQueueConcurrency((key) =>
        settings.number(key),
      );
      for (const c of changes) {
        this.log.log(
          { ...c, metric: 'queue_concurrency' },
          'queue worker concurrency changed',
        );
      }
    } catch (e) {
      this.log.warn(`queue concurrency not applied: ${String(e)}`);
    }
  }
}
