import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  incidentBody,
  incidentTitle,
} from '../../common/ops/status/incident-texts';
import { IncidentsService } from '../../common/ops/status/incidents.service';
import {
  StatusProbesService,
  WATCHED,
} from '../../common/ops/status/status-probes.service';
import { PushQueueService } from '../../modules/notifications/push/push-queue.service';

export interface WatchdogResult {
  checked: number;
  opened: number;
  reminded: number;
  resolved: number;
  alertsQueued: number;
}

/**
 * Owner 2026-10-22: `ops.status-watchdog`, every minute — the on-call
 * engineer nobody has to hire. Reads the same probes as the status board;
 * two red checks in a row open an incident, two good ones close it, an open
 * one is repeated every 15 minutes. Admins with the «Дежурный» right (and
 * their switch on) get a push and an e-mail. Isolated: it only reads the
 * probes, writes `system_incidents` and queues alerts; its own failure
 * never touches anything else, and no outside service is involved.
 */
@Injectable()
export class StatusWatchdogJob {
  constructor(
    private readonly probes: StatusProbesService,
    private readonly incidents: IncidentsService,
    private readonly push: PushQueueService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StatusWatchdogJob.name);
  }

  async run(now: Date = new Date()): Promise<WatchdogResult> {
    const all = await this.probes.watched(now);
    const results = all.filter((r) =>
      (WATCHED as readonly string[]).includes(r.key),
    );
    const events = await this.incidents.reconcile(results, now);
    const out: WatchdogResult = {
      checked: results.length,
      opened: 0,
      reminded: 0,
      resolved: 0,
      alertsQueued: 0,
    };
    if (events.length === 0) return out;

    const people = await this.incidents.recipients();
    for (const e of events) {
      if (e.kind === 'opened') out.opened++;
      else if (e.kind === 'reminder') out.reminded++;
      else out.resolved++;
      this.logger.warn(
        { alert: `incident_${e.kind}`, component: e.incident.component },
        'status incident',
      );
      for (const p of people) {
        await this.push.enqueueOpsAlert({
          recipientId: p.userId,
          title: incidentTitle(e.incident.component, e.kind, p.lang),
          body: incidentBody(
            e.incident.detail,
            e.kind,
            p.lang,
            e.incident.openedAt,
            now,
          ),
          incidentId: e.incident.id,
          event: e.kind,
          seq: e.seq,
          email: Boolean(p.email),
        });
        out.alertsQueued++;
      }
    }
    return out;
  }
}
