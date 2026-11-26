import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

/**
 * Б6 (25.11, docs/dev/STAGE2_SRE_CLOUD_2026-11-25.md, gaps №10/11; SRE
 * Workbook ch. 2 «measure close to the user»): service level as the PERSON
 * sees it, next to the server's own SLIs (`{metric:"slo"}`, SloMetricsService).
 *
 * The app and the website send anonymous usage events through the existing
 * intake (POST /app-events, opt-in «usage statistics», no person, no id):
 *
 *  - `sli_<flow>_<ok|slow|fail>` for the six SLO flows (sign-in, feed, chat
 *    send, payment, call, opening a push), counted by the app's HTTP layer
 *    after its own retries (apps/mobile/lib/core/diagnostics/client_sli.dart);
 *  - `web_vital_<lcp|inp|cls|ttfb>_<good|ni|poor>` from the website
 *    (web-vitals 6.2.3, apps/mobile/web/js/web_vitals_beacon.js).
 *
 * They are NOT stored per day (no database write): they are only added up in
 * memory and written as ONE log line a minute per process,
 * `{metric:"slo_client", loginOk, loginBad, …, lcpGood, lcpAll, …}`, which the
 * CloudWatch metric filters of infra/modules/monitoring/user-slis.tf turn
 * into burn-rate alarms (and «fewer than 75 % good» = the web.dev p75 rule).
 */
export const CLIENT_SLI_COUNTERS = [
  'loginOk',
  'loginBad',
  'feedOk',
  'feedBad',
  'msgOk',
  'msgBad',
  'payOk',
  'payBad',
  'callOk',
  'callBad',
  'pushOk',
  'pushBad',
  'lcpGood',
  'lcpAll',
  'inpGood',
  'inpAll',
  'clsGood',
  'clsAll',
  'ttfbGood',
  'ttfbAll',
] as const;
export type ClientSliCounter = (typeof CLIENT_SLI_COUNTERS)[number];

const FLOW_PREFIX: Record<string, string> = {
  login: 'login',
  feed: 'feed',
  message: 'msg',
  pay: 'pay',
  call: 'call',
  push: 'push',
};
const SLI = /^sli_(login|feed|message|pay|call|push)_(ok|slow|fail)$/;
const VITAL = /^web_vital_(lcp|inp|cls|ttfb)_(good|ni|poor)$/;
const FLUSH_MS = 60_000;

/** The counters one event name adds to; [] = not a client SLI event. */
export function countersOf(name: string): ClientSliCounter[] {
  const s = SLI.exec(name);
  if (s) {
    const p = FLOW_PREFIX[s[1]];
    return [`${p}${s[2] === 'ok' ? 'Ok' : 'Bad'}` as ClientSliCounter];
  }
  const v = VITAL.exec(name);
  if (v) {
    const all = `${v[1]}All` as ClientSliCounter;
    return v[2] === 'good' ? [`${v[1]}Good` as ClientSliCounter, all] : [all];
  }
  return [];
}

/** Whether the event is a client SLI / web vital (not stored per day). */
export function isClientSliEvent(name: string): boolean {
  return SLI.test(name) || VITAL.test(name);
}

@Injectable()
export class ClientSliMetricsService
  implements OnModuleInit, OnApplicationShutdown
{
  private counts = new Map<ClientSliCounter, number>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ClientSliMetricsService.name);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  /** Counts one event; false when the name is not a client SLI. */
  record(name: string): boolean {
    const cs = countersOf(name);
    for (const c of cs) this.counts.set(c, (this.counts.get(c) ?? 0) + 1);
    return cs.length > 0;
  }

  /** Writes the minute's line and starts over; nothing counted = no line. */
  flush(): Record<ClientSliCounter, number> | null {
    if (this.counts.size === 0) return null;
    const line = Object.fromEntries(
      CLIENT_SLI_COUNTERS.map((k) => [k, this.counts.get(k) ?? 0]),
    ) as Record<ClientSliCounter, number>;
    this.counts = new Map();
    this.logger.info({ metric: 'slo_client', ...line }, 'client sli counters');
    return line;
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
