import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  ConfigRolloutService,
  type WatchResult,
} from '../../common/app-settings/config-rollout.service';
import { IncidentsService } from '../../common/ops/status/incidents.service';
import { PushQueueService } from '../../modules/notifications/push/push-queue.service';

/**
 * Б3 (25.11): `settings.rollout-watch`, every minute. A setting change
 * under watch (config-rollout.ts) is reverted for everyone when an SLO
 * fast-burn alarm fired after it started, or released to everyone when its
 * window is over. A revert is told to the on-call admins (push + e-mail,
 * the same channel as the status watchdog).
 */
@Injectable()
export class SettingsRolloutWatchJob {
  constructor(
    private readonly rollouts: ConfigRolloutService,
    private readonly logger: PinoLogger,
    @Optional() private readonly incidents?: IncidentsService,
    @Optional() private readonly push?: PushQueueService,
  ) {
    this.logger.setContext(SettingsRolloutWatchJob.name);
  }

  async run(now: Date = new Date()): Promise<WatchResult> {
    const result = await this.rollouts.watch(now);
    if (result.reverted.length === 0 && result.held.length === 0) {
      return result;
    }
    const people = (await this.incidents?.recipients()) ?? [];
    // Review of #1332: an alarm during the watch while the same alarm was
    // already firing before the change — nothing is undone automatically
    // in the middle of an incident; on-call decides («Вернуть» in the
    // admin, or wait for the window).
    for (const h of result.held) {
      for (const p of people) {
        await this.push?.enqueueOpsAlert({
          recipientId: p.userId,
          title:
            p.lang === 'ru'
              ? 'Тревога во время проверки настроек'
              : 'Alarm while a settings change is watched',
          body:
            p.lang === 'ru'
              ? `Тревога ${h.alarm} уже была до изменения (${h.keys.join(', ')}), поэтому автоотката нет. Если виновато изменение — «Вернуть» в Настройки → Изменения под наблюдением.`
              : `Alarm ${h.alarm} was already firing before the change (${h.keys.join(', ')}), so it was NOT reverted automatically. If the change is to blame, press «Вернуть» in Settings → Changes under watch.`,
          incidentId: h.id,
          event: 'settings_auto_revert_held',
          seq: 0,
          email: Boolean(p.email),
        });
      }
    }
    for (const r of result.reverted) {
      for (const p of people) {
        await this.push?.enqueueOpsAlert({
          recipientId: p.userId,
          title:
            p.lang === 'ru'
              ? 'Изменение настроек отменено само'
              : 'A settings change was reverted',
          body:
            p.lang === 'ru'
              ? `Во время проверки сработала тревога ${r.alarm}. Старые значения вернулись. Журнал аудита: «Автоотмена изменения настроек».`
              : `Alarm ${r.alarm} fired while the change was watched. The old values are back. Audit log: settings.auto_revert.`,
          incidentId: r.id,
          event: 'settings_auto_revert',
          seq: 0,
          email: Boolean(p.email),
        });
      }
    }
    return result;
  }
}
