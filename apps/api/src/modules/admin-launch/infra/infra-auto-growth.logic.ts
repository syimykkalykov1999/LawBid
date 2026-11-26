import type { InfraTarget } from '../../../common/ops/infra-switches';

/**
 * Owner 26.11 («автоматизируй их не мучая меня»): the growth items whose
 * code was merged behind a manual tfvars line (FIX_PLAN_2026-11-25 «Шаги
 * владельца», SECOND_PASS_2026-11-26) become «Авто» rows next to the
 * existing ones. Same mechanism, nothing new: a want here goes through
 * autoWants (modes Выкл / Вкл / Авто, ladders), dueWants (infra.auto_on_minutes
 * / infra.auto_off_hours hysteresis), autoRefusal (quiet hours, daily cap,
 * money) and the same InfraChangeRequest -> GitHub plan -> apply, and a plan
 * is applied without the owner only inside GROWTH_AUTO_SCOPE (autoApplyBlockers:
 * never a delete of serving infrastructure). Pure; the I/O is in
 * infra-auto.service.ts.
 *
 *  - aws.alb_balancing (S4-7 / S8, #1313): least-outstanding balancing + the
 *    separate sticky socket group. AWS ELB user guide: least outstanding
 *    requests suits requests of different cost and fleets of two or more
 *    targets; so on from `infra.edge_on_api_tasks` (2) API tasks wanted.
 *  - aws.api_canary_prepare (X1, #1296): the green target group and rule 11
 *    behind rule 10 (no traffic moves). After the balancing row (ladder:
 *    the socket group must exist before ECS gets the second pair).
 *  - aws.api_canary: NOT automatic. `canary` removes rule 10 (and rule 9):
 *    deleting a serving listener rule never goes without the owner
 *    (NEVER_AUTO_DESTROY, D1-34), so the row is Выкл / Вкл only.
 *  - aws.tracing (O7, #1288): on while the API is slow or erroring (the
 *    SRE Workbook ch. 5 fast burn: 14.4x the 0.1 % budget), off again after
 *    the quiet cool-down (it is billed per trace).
 *  - aws.db_logical_replication (C2, #1298): PREPARES the database only.
 *    rds.logical_replication is STATIC: it acts after a reboot, and the
 *    GRANT rds_replication needs the master user. Both stay owner steps
 *    (docs/runbooks/cache-cdc.md). Never off by itself (removing it needs
 *    ResetDBParameterGroup, KNOWN_ERRORS 173).
 */

/** The ALB balancing, the canary preparation, the canary: each step needs
 * the one before it, and only the top one may go (LADDERS). */
export const EDGE_LADDER: readonly string[] = [
  'aws.alb_balancing',
  'aws.api_canary_prepare',
  'aws.api_canary',
];

/** Defaults of the admin settings (app-settings.defaults.ts). */
export const EDGE_ON_API_TASKS = 2;
export const TRACING_ON_P95_MS = 600;
export const TRACING_ON_ERROR_PCT = 2;
export const TRACING_MIN_REQUESTS = 300;
export const CDC_PREPARE_ON_API_TASKS = 4;
/** Kept on while p95 >= this share of the line (5xx: half of its line). */
export const TRACING_KEEP_P95_SHARE = 0.8;

export interface HttpWindowLike {
  requests: number;
  errorRatePct: number;
  p95Ms: number | null;
}

export interface GrowthSignals {
  /** ECS desired count of the api service (null = unknown). */
  apiDesired?: number | null;
  /** `infra.edge_on_api_tasks`. */
  edgeOnApiTasks?: number;
  /** HttpStatsService.window(15) of all API tasks (null = unknown). */
  http15?: HttpWindowLike | null;
  /** `infra.tracing_on_p95_ms`, `infra.tracing_on_error_pct`,
   * `infra.tracing_min_requests`. */
  tracingOnP95Ms?: number;
  tracingOnErrorPct?: number;
  tracingMinRequests?: number;
  /** `infra.cdc_prepare_on_api_tasks`. */
  cdcPrepareOnApiTasks?: number;
}

const pos = (v: number | undefined, d: number): number =>
  v != null && Number.isFinite(v) && v > 0 ? v : d;

/**
 * slow = switch tracing on; keep = not slow any more but inside the band
 * (hysteresis); calm = may go after the cool-down; null = unknown (a failed
 * read never switches anything).
 */
export function tracingSignal(
  s: GrowthSignals,
): 'slow' | 'keep' | 'calm' | null {
  const w = s.http15;
  if (!w) return null;
  const p95Line = pos(s.tracingOnP95Ms, TRACING_ON_P95_MS);
  const errLine = pos(s.tracingOnErrorPct, TRACING_ON_ERROR_PCT);
  const enough = w.requests >= pos(s.tracingMinRequests, TRACING_MIN_REQUESTS);
  if (!enough) return 'calm';
  const p95 = w.p95Ms ?? 0;
  if (p95 >= p95Line || w.errorRatePct >= errLine) return 'slow';
  if (p95 >= p95Line * TRACING_KEEP_P95_SHARE || w.errorRatePct >= errLine / 2)
    return 'keep';
  return 'calm';
}

/** Tracing stays on unless it is calm (unknown = keep). */
export function tracingKeep(s: GrowthSignals): boolean {
  return tracingSignal(s) !== 'calm';
}

/** Enough API tasks for the balancing and the canary preparation. */
export function edgeNeeded(s: GrowthSignals): boolean {
  return (
    s.apiDesired != null &&
    Number.isFinite(s.apiDesired) &&
    s.apiDesired >= pos(s.edgeOnApiTasks, EDGE_ON_API_TASKS)
  );
}

export interface GrowthWant {
  id: string;
  to: InfraTarget;
  reason: string;
}

/** The switch-ons of the growth items (the off of tracing is KEEP_ON). */
export function growthWants(
  s: GrowthSignals,
  live: (id: string) => InfraTarget | null,
): GrowthWant[] {
  const out: GrowthWant[] = [];
  if (edgeNeeded(s) && live('aws.alb_balancing') !== 'on') {
    out.push({
      id: 'aws.alb_balancing',
      to: 'on',
      reason: `Серверов API ${s.apiDesired} (не меньше ${pos(s.edgeOnApiTasks, EDGE_ON_API_TASKS)}): запросы должны идти на наименее занятый сервер, сокеты — в свою липкую группу.`,
    });
  }
  if (
    edgeNeeded(s) &&
    live('aws.alb_balancing') === 'on' &&
    live('aws.api_canary_prepare') !== 'on'
  ) {
    out.push({
      id: 'aws.api_canary_prepare',
      to: 'on',
      reason: `Серверов API ${s.apiDesired}: готовится выкат силами самого ECS (вторая группа серверов, трафик не двигается).`,
    });
  }
  if (tracingSignal(s) === 'slow' && live('aws.tracing') !== 'on') {
    const w = s.http15!;
    out.push({
      id: 'aws.tracing',
      to: 'on',
      reason: `API медленный или с ошибками (p95 за 15 минут ${w.p95Ms ?? 0} мс, ошибок 5xx ${w.errorRatePct} %): нужны трассы, чтобы увидеть, где теряется время.`,
    });
  }
  if (
    live('aws.db_logical_replication') !== 'on' &&
    s.apiDesired != null &&
    Number.isFinite(s.apiDesired) &&
    s.apiDesired >= pos(s.cdcPrepareOnApiTasks, CDC_PREPARE_ON_API_TASKS)
  ) {
    out.push({
      id: 'aws.db_logical_replication',
      to: 'on',
      reason: `Серверов API ${s.apiDesired} (не меньше ${pos(s.cdcPrepareOnApiTasks, CDC_PREPARE_ON_API_TASKS)}): чем больше серверов пишут в базу, тем важнее второй путь сброса кэша; база готовится к сбросу по журналу изменений (подействует после перезагрузки базы, это шаг владельца).`,
    });
  }
  return out;
}

const S = 'module\\.stack\\.';
const end = '(\\[|$)';
const re = (body: string) => new RegExp(`^${S}${body}`);

/**
 * What the plan of each growth item may touch (Terraform addresses under
 * infra/envs/prod `module.stack`), checked by autoApplyBlockers with the
 * rest of AUTO_SCOPE. New task definitions, in-place service updates and
 * new alarms are allowed for every item there already. aws.api_canary is
 * left out on purpose (its plan deletes rule 10: always the owner's 2FA).
 */
export const GROWTH_AUTO_SCOPE: Readonly<Record<string, readonly RegExp[]>> = {
  'aws.alb_balancing': [
    re(
      `module\\.alb\\.(aws_lb_target_group\\.(api|api_ws|api_green|api_ws_green)|aws_lb_listener_rule\\.(api_ws|api_ws_weighted))${end}`,
    ),
  ],
  'aws.api_canary_prepare': [
    re(
      `module\\.alb\\.(aws_lb_target_group\\.(api_green|api_ws_green)|aws_lb_listener_rule\\.(api_weighted|api_ws_weighted))${end}`,
    ),
    // 25.11: request + predictive scaling read both target groups once
    // the green group exists (modules/stack api_two_target_groups).
    re(
      `module\\.ecs\\.aws_appautoscaling_policy\\.(api_requests|api_predictive)${end}`,
    ),
  ],
  'aws.tracing': [
    re(`module\\.ecs\\.aws_iam_role_policy\\.(xray|split_xray)${end}`),
  ],
  'aws.db_logical_replication': [
    re(
      `module\\.postgres(\\[0\\])?\\.aws_db_parameter_group\\.(this|pg18)${end}`,
    ),
  ],
};
