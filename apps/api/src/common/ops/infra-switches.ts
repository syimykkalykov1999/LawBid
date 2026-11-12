/**
 * INFRA SWITCHES FROM THE ADMIN (owner 2026-10-26, brief "Infra switches
 * from the admin"): the WHITELIST of Terraform variables the admin may
 * change, and what Выкл / Вкл mean for each cost-registry row.
 *
 * The one file these values land in is
 * `infra/envs/prod/growth.auto.tfvars.json` (Terraform loads
 * `*.auto.tfvars.json` by itself, after terraform.tfvars, so it wins). Only
 * keys declared here can ever be written there:
 *   - booleans, whole numbers inside [min, max], or one word from a fixed list;
 *   - never a secret, an ARN, a free text or a list;
 *   - never a switch whose Выкл deletes data (backups, the database, keys,
 *     buckets): those rows are simply not in INFRA_SWITCHES, and the workflow
 *     refuses any plan that destroys a FORBIDDEN_DESTROY resource.
 *
 * `infra/envs/prod/growth.auto.tfvars.schema.json` is generated from this
 * file (infra-switches.spec.ts fails when they differ) and is what the
 * `infra-apply` workflow checks before it writes anything.
 *
 * Self-contained, erasable TypeScript only (no enums, no imports), like
 * cost-registry.ts.
 */

export type InfraValue = boolean | number | string;

export type InfraKeySpec =
  | { type: 'boolean' }
  | { type: 'integer'; min: number; max: number }
  | { type: 'choice'; values: readonly string[] };

export interface InfraKey {
  /** Where the value sits in growth.auto.tfvars.json. */
  path: readonly [string] | readonly [string, string];
  spec: InfraKeySpec;
}

const bool = (name: string): InfraKey => ({
  path: [name],
  spec: { type: 'boolean' },
});
const int = (path: InfraKey['path'], min: number, max: number): InfraKey => ({
  path,
  spec: { type: 'integer', min, max },
});
const choice = (name: string, values: readonly string[]): InfraKey => ({
  path: [name],
  spec: { type: 'choice', values },
});

/** The object in the JSON file that holds `growth.<k>` keys. */
export const GROWTH_CONTAINER = 'growth_switches';

/**
 * Every key the admin may write. Top-level names are variables of
 * infra/envs/prod/variables.tf; `growth.<k>` keys go to the
 * `growth_switches` object (infra/envs/prod/growth.tf), merged over
 * `growth` from terraform.tfvars, so a growth line there is not lost.
 */
export const INFRA_KEYS: Readonly<Record<string, InfraKey>> = {
  waf_enabled: bool('waf_enabled'),
  cdn_waf_enabled: bool('cdn_waf_enabled'),
  uptime_check: choice('uptime_check', ['off', 'route53', 'synthetics']),
  guardduty_enabled: bool('guardduty_enabled'),
  guardduty_ebs_malware: bool('guardduty_ebs_malware'),
  guardduty_runtime_monitoring: bool('guardduty_runtime_monitoring'),
  cloudtrail_athena_enabled: bool('cloudtrail_athena_enabled'),
  replicate_media: bool('replicate_media'),
  container_insights: choice('container_insights', [
    'disabled',
    'enabled',
    'enhanced',
  ]),
  turn_enabled: bool('turn_enabled'),
  turn_on_demand: bool('turn_on_demand'),
  turn_second_enabled: bool('turn_second_enabled'),
  livekit_enabled: bool('livekit_enabled'),
  db_pooler_enabled: bool('db_pooler_enabled'),
  partition_role_enabled: bool('partition_role_enabled'),
  security_hub_enabled: bool('security_hub_enabled'),
  inspector_enabled: bool('inspector_enabled'),
  config_enabled: bool('config_enabled'),
  macie_enabled: bool('macie_enabled'),
  audit_logs_enabled: bool('audit_logs_enabled'),
  waf_bot_control_enabled: bool('waf_bot_control_enabled'),
  waf_bot_control_block: bool('waf_bot_control_block'),
  waf_device_header: choice('waf_device_header', ['', 'x-device-id']),
  waf_auth_rules_enabled: bool('waf_auth_rules_enabled'),
  waf_auth_rate_action: choice('waf_auth_rate_action', ['count', 'block']),
  nat_per_az: bool('nat_per_az'),
  api_min_tasks: int(['api_min_tasks'], 1, 4),
  rds_cross_region_backups: bool('rds_cross_region_backups'),
  cpu_architecture: choice('cpu_architecture', ['X86_64', 'ARM64']),
  api_spot: bool('api_spot'),
  worker_spot: bool('worker_spot'),
  db_shards: int(['db_shards'], 0, 3),
  'growth.rds_read_replicas': int(
    [GROWTH_CONTAINER, 'rds_read_replicas'],
    0,
    5,
  ),
  'growth.opensearch_enabled': {
    path: [GROWTH_CONTAINER, 'opensearch_enabled'],
    spec: { type: 'boolean' },
  },
  // Owner 2026-11-12 («Авто» by count): data nodes of the search engine
  // domain. Two Availability Zones in prod = 1, 2 or 4 (AWS wants an even
  // count across two zones; modules/stack/growth.tf refuses 3).
  'growth.opensearch_instance_count': int(
    [GROWTH_CONTAINER, 'opensearch_instance_count'],
    1,
    4,
  ),
  // G4 (2026-11-08): the Kinesis stream the `events.sink = auto` switch needs.
  'growth.events_stream_enabled': {
    path: [GROWTH_CONTAINER, 'events_stream_enabled'],
    spec: { type: 'boolean' },
  },
  // G5 (2026-11-08): the separate cache Redis `cache.redis_mode = auto` uses.
  redis_cache_node: bool('redis_cache_node'),
};

export type InfraTarget = 'off' | 'on';

export interface InfraSwitch {
  /** cost-registry.ts id of the row this switch belongs to. */
  id: string;
  /** The exact values for Выкл and Вкл (keys from INFRA_KEYS). */
  values: Record<InfraTarget, Record<string, InfraValue>>;
  /** Owner 2026-11-12 (foreman: AWS Shield Advanced, Cloudflare «Under
   * Attack», Akamai, Fastly all BLOCK during an attack): the values an
   * automatic switch-on writes instead of `values.on` (a manual Вкл keeps
   * `values.on`). Keys from INFRA_KEYS. */
  autoOn?: Record<string, InfraValue>;
  /** Plain Russian: what happens to the app while the change applies. */
  impact: string;
}

/**
 * Registry rows the admin may flip. Left out on purpose:
 *  - aws.backup (Выкл deletes the backup plan and its recovery points);
 *  - aws.rds_proxy (needs a secret ARN: not a boolean or a size);
 *  - aws.vpc_endpoints (a list of services, not a boolean);
 *  - aws.fargate_*, aws.rds, aws.redis, aws.nat, aws.budgets_anomaly
 *    (one position only, or sized by the autoscalers / «Экономика»);
 *  - hidden.* rows (the same variable as a visible row: one place to flip).
 */
export const INFRA_SWITCHES: readonly InfraSwitch[] = [
  {
    id: 'aws.waf_alb',
    values: { off: { waf_enabled: false }, on: { waf_enabled: true } },
    impact: 'Без перерыва. Без фильтра не работает белый список админки.',
  },
  {
    id: 'aws.waf_cdn',
    values: { off: { cdn_waf_enabled: false }, on: { cdn_waf_enabled: true } },
    impact: 'Без перерыва; CloudFront обновляется 5–15 минут.',
  },
  {
    id: 'aws.route53_check',
    values: { off: { uptime_check: 'off' }, on: { uptime_check: 'route53' } },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.synthetics',
    values: {
      off: { uptime_check: 'route53' },
      on: { uptime_check: 'synthetics' },
    },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.guardduty',
    values: {
      off: { guardduty_enabled: false },
      on: { guardduty_enabled: true },
    },
    impact: 'Без перерыва. При выключении история находок охраны стирается.',
  },
  {
    id: 'aws.guardduty_extras',
    values: {
      off: {
        guardduty_ebs_malware: false,
        guardduty_runtime_monitoring: false,
      },
      on: { guardduty_runtime_monitoring: true },
    },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.athena',
    values: {
      off: { cloudtrail_athena_enabled: false },
      on: { cloudtrail_athena_enabled: true },
    },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.s3',
    values: { off: { replicate_media: false }, on: { replicate_media: true } },
    impact: 'Без перерыва. Уже скопированные файлы остаются.',
  },
  {
    id: 'aws.container_insights',
    values: {
      off: { container_insights: 'disabled' },
      on: { container_insights: 'enabled' },
    },
    impact: 'Без перерыва.',
  },
  // aws.turn_own is an app-setting now (calls.own_turn.mode, owner 2026-11-02).
  {
    id: 'aws.livekit',
    values: { off: { livekit_enabled: false }, on: { livekit_enabled: true } },
    impact: 'Групповые звонки на время переключения могут прерваться.',
  },
  {
    id: 'aws.rds_replicas',
    values: {
      off: { 'growth.rds_read_replicas': 0 },
      on: { 'growth.rds_read_replicas': 1 },
    },
    impact:
      'Без перерыва: копия базы создаётся 15–40 минут, приложение работает как обычно.',
  },
  {
    id: 'aws.rds_replicas_2',
    values: {
      off: { 'growth.rds_read_replicas': 1 },
      on: { 'growth.rds_read_replicas': 2 },
    },
    impact:
      'Без перерыва: ещё одна копия базы создаётся 15–40 минут; чтения сами делятся между копиями.',
  },
  {
    id: 'aws.rds_replicas_3',
    values: {
      off: { 'growth.rds_read_replicas': 2 },
      on: { 'growth.rds_read_replicas': 3 },
    },
    impact:
      'Без перерыва: ещё одна копия базы создаётся 15–40 минут; чтения сами делятся между копиями.',
  },
  {
    id: 'aws.rds_replicas_4',
    values: {
      off: { 'growth.rds_read_replicas': 3 },
      on: { 'growth.rds_read_replicas': 4 },
    },
    impact:
      'Без перерыва: ещё одна копия базы создаётся 15–40 минут; чтения сами делятся между копиями.',
  },
  {
    id: 'aws.rds_replicas_5',
    values: {
      off: { 'growth.rds_read_replicas': 4 },
      on: { 'growth.rds_read_replicas': 5 },
    },
    impact:
      'Без перерыва: ещё одна копия базы создаётся 15–40 минут; чтения сами делятся между копиями.',
  },
  {
    id: 'aws.db_shards',
    values: {
      off: { db_shards: 0 },
      on: { db_shards: 1 },
    },
    impact:
      'Без перерыва: сервер создаётся 15–40 минут и стоит пустым; при следующей выкладке на нём сами появляются схема и роли. Данные переезжают только по кнопке «Разделить базу».',
  },
  // Owner 2026-11-11: the third and fourth database servers (same db_shards
  // count; on = one more than the previous row). Off only lowers the count
  // back by one; the plan guard refuses to delete a server with data.
  {
    id: 'aws.db_shards_2',
    values: {
      off: { db_shards: 1 },
      on: { db_shards: 2 },
    },
    impact:
      'Без перерыва: третий сервер создаётся 15–40 минут и стоит пустым; при следующей выкладке на нём сами появляются схема и роли. Данные переезжают ночью сами (Авто) или по кнопке.',
  },
  {
    id: 'aws.db_shards_3',
    values: {
      off: { db_shards: 2 },
      on: { db_shards: 3 },
    },
    impact:
      'Без перерыва: четвёртый сервер создаётся 15–40 минут и стоит пустым; при следующей выкладке на нём сами появляются схема и роли. Данные переезжают ночью сами (Авто) или по кнопке.',
  },
  {
    id: 'aws.opensearch',
    values: {
      off: { 'growth.opensearch_enabled': false },
      on: { 'growth.opensearch_enabled': true },
    },
    impact:
      'Без перерыва: движок создаётся 15–30 минут; поиск переключается отдельно настройкой search.engine.',
  },
  {
    id: 'aws.opensearch_nodes_2',
    values: {
      off: { 'growth.opensearch_instance_count': 1 },
      on: { 'growth.opensearch_instance_count': 2 },
    },
    impact:
      'Без перерыва: AWS сам переносит поиск на два узла в двух зонах (сине-зелёная замена, 20–60 минут); поиск работает всё время.',
  },
  {
    id: 'aws.opensearch_nodes_4',
    values: {
      off: { 'growth.opensearch_instance_count': 2 },
      on: { 'growth.opensearch_instance_count': 4 },
    },
    impact:
      'Без перерыва: AWS сам переносит поиск на четыре узла (по два в каждой зоне, сине-зелёная замена, 20–60 минут); поиск работает всё время.',
  },
  {
    id: 'aws.events_stream',
    values: {
      off: { 'growth.events_stream_enabled': false },
      on: { 'growth.events_stream_enabled': true },
    },
    impact:
      'Без перерыва: поток создаётся за минуту, серверы перезапускаются по очереди и начинают отправлять в него события; события в таблице остаются.',
  },
  {
    id: 'aws.redis_cache',
    values: {
      off: { redis_cache_node: false },
      on: { redis_cache_node: true },
    },
    impact:
      'Без перерыва: узел кэша создаётся 10–15 минут, серверы перезапускаются по очереди; до этого кэш живёт в основном Redis.',
  },
  {
    id: 'aws.pgbouncer',
    values: {
      off: { db_pooler_enabled: false },
      on: { db_pooler_enabled: true },
    },
    impact: 'Серверы API перезапускаются по очереди (без перерыва).',
  },
  {
    id: 'aws.partition_role',
    values: {
      off: { partition_role_enabled: false },
      on: { partition_role_enabled: true },
    },
    impact:
      'Без перерыва: фоновые серверы перезапускаются по очереди и получают вход для деления больших таблиц.',
  },
  {
    id: 'aws.security_hub',
    values: {
      off: { security_hub_enabled: false },
      on: { security_hub_enabled: true },
    },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.inspector',
    values: {
      off: { inspector_enabled: false },
      on: { inspector_enabled: true },
    },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.aws_config',
    values: { off: { config_enabled: false }, on: { config_enabled: true } },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.macie',
    values: { off: { macie_enabled: false }, on: { macie_enabled: true } },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.audit_logs',
    values: {
      off: { audit_logs_enabled: false },
      on: { audit_logs_enabled: true },
    },
    impact: 'Без перерыва.',
  },
  {
    id: 'aws.waf_extra_rules',
    values: {
      off: { waf_device_header: '', waf_auth_rules_enabled: false },
      on: {
        waf_device_header: 'x-device-id',
        waf_auth_rules_enabled: true,
        waf_auth_rate_action: 'count',
      },
    },
    // Авто during an attack: the login rule blocks at once.
    autoOn: {
      waf_device_header: 'x-device-id',
      waf_auth_rules_enabled: true,
      waf_auth_rate_action: 'block',
    },
    impact:
      'Без перерыва. «Вкл» — правила сначала только считают; «Авто» во время атаки сразу блокирует.',
  },
  {
    id: 'aws.waf_bot_control',
    values: {
      off: { waf_bot_control_enabled: false, waf_bot_control_block: false },
      on: { waf_bot_control_enabled: true, waf_bot_control_block: false },
    },
    // Авто during an attack: the bot verdicts are blocked, not only counted.
    autoOn: { waf_bot_control_enabled: true, waf_bot_control_block: true },
    impact:
      'Без перерыва. «Вкл» — только считает; «Авто» во время атаки блокирует ботов.',
  },
  {
    id: 'aws.ha_extras',
    values: {
      off: {
        nat_per_az: false,
        api_min_tasks: 1,
        rds_cross_region_backups: false,
      },
      on: {
        nat_per_az: true,
        api_min_tasks: 2,
        rds_cross_region_backups: true,
      },
    },
    impact:
      'Выход в интернет переключается на новый NAT: до минуты внешние сервисы (Stripe, SMS) могут не отвечать.',
  },
  {
    id: 'aws.graviton_spot',
    values: {
      off: { cpu_architecture: 'X86_64', api_spot: false, worker_spot: false },
      on: { cpu_architecture: 'ARM64', api_spot: true, worker_spot: true },
    },
    impact:
      'Серверы перезапускаются по очереди. Нужен образ для ARM (выкат делает его сам).',
  },
];

/**
 * Resource types a plan from the admin may NEVER destroy or replace: data
 * that cannot come back. The read replica (`aws_db_instance.replica`) is a
 * copy and may go. The workflow and the API both check this.
 */
export const FORBIDDEN_DESTROY: readonly string[] = [
  'aws_db_instance',
  'aws_rds_cluster',
  'aws_rds_cluster_instance',
  'aws_kms_key',
  'aws_s3_bucket',
  'aws_backup_vault',
  'aws_secretsmanager_secret',
  'aws_secretsmanager_secret_version',
  'aws_dynamodb_table',
  'aws_elasticache_replication_group',
  'aws_elasticache_cluster',
  'aws_ecr_repository',
];

/** Addresses of FORBIDDEN_DESTROY types that may go anyway. */
export const DESTROY_ALLOWED: readonly RegExp[] = [
  /aws_db_instance\.replica(\[|$)/,
];

export function switchFor(id: string): InfraSwitch | undefined {
  return INFRA_SWITCHES.find((s) => s.id === id);
}

/** null = the value may be written for this key; otherwise why not. */
export function checkValue(key: string, value: unknown): string | null {
  const k = INFRA_KEYS[key];
  if (!k) return `key ${key} is not in the whitelist`;
  const s = k.spec;
  if (s.type === 'boolean') {
    return typeof value === 'boolean' ? null : `${key} must be true or false`;
  }
  if (s.type === 'integer') {
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= s.min &&
      value <= s.max
      ? null
      : `${key} must be a whole number ${s.min}..${s.max}`;
  }
  return typeof value === 'string' && s.values.includes(value)
    ? null
    : `${key} must be one of: ${s.values.map((v) => `"${v}"`).join(', ')}`;
}

/** Every problem of a parsed growth.auto.tfvars.json (empty = fine). */
export function fileProblems(file: Record<string, unknown>): string[] {
  const top = new Map<string, string>();
  const nested = new Map<string, string>();
  for (const [key, k] of Object.entries(INFRA_KEYS)) {
    if (k.path.length === 1) top.set(k.path[0], key);
    else nested.set(`${k.path[0]}.${k.path[1]}`, key);
  }
  const containers = new Set([...nested.keys()].map((k) => k.split('.')[0]));
  const out: string[] = [];
  for (const [name, value] of Object.entries(file)) {
    if (containers.has(name)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        out.push(`${name} must be an object`);
        continue;
      }
      for (const [inner, v] of Object.entries(value)) {
        const key = nested.get(`${name}.${inner}`);
        if (!key) out.push(`key ${name}.${inner} is not in the whitelist`);
        else {
          const bad = checkValue(key, v);
          if (bad) out.push(bad);
        }
      }
      continue;
    }
    const key = top.get(name);
    if (!key) {
      out.push(`key ${name} is not in the whitelist`);
      continue;
    }
    const bad = checkValue(key, value);
    if (bad) out.push(bad);
  }
  return out;
}

/**
 * Applies [changes] to the parsed growth.auto.tfvars.json and returns the
 * new object. Throws on any key or value outside the whitelist, so nothing
 * else can ever be written. Unknown keys already in the file also fail.
 */
export function applyToFile(
  file: Record<string, unknown>,
  changes: Record<string, InfraValue>,
): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    const bad = checkValue(key, value);
    if (bad) throw new Error(bad);
    const p = INFRA_KEYS[key].path;
    if (p.length === 1) {
      out[p[0]] = value;
    } else {
      const cur = out[p[0]] ?? {};
      if (typeof cur !== 'object' || Array.isArray(cur)) {
        throw new Error(`${p[0]} must be an object`);
      }
      out[p[0]] = { ...(cur as Record<string, unknown>), [p[1]]: value };
    }
  }
  const bad = fileProblems(out);
  if (bad.length) throw new Error(bad.join('; '));
  return out;
}

/** Reads a key's current value from the parsed file (undefined = absent). */
export function valueInFile(
  file: Record<string, unknown>,
  key: string,
): InfraValue | undefined {
  const p = INFRA_KEYS[key]?.path;
  if (!p) return undefined;
  const v =
    p.length === 1
      ? file[p[0]]
      : ((file[p[0]] ?? {}) as Record<string, unknown>)[p[1]];
  return v as InfraValue | undefined;
}

/** JSON Schema (draft 2020-12) of growth.auto.tfvars.json. */
export function fileSchema(): Record<string, unknown> {
  const prop = (s: InfraKeySpec): Record<string, unknown> =>
    s.type === 'boolean'
      ? { type: 'boolean' }
      : s.type === 'integer'
        ? { type: 'integer', minimum: s.min, maximum: s.max }
        : { type: 'string', enum: [...s.values] };
  const top: Record<string, unknown> = {};
  const nested: Record<string, Record<string, unknown>> = {};
  for (const k of Object.values(INFRA_KEYS)) {
    if (k.path.length === 1) top[k.path[0]] = prop(k.spec);
    else (nested[k.path[0]] ??= {})[k.path[1]] = prop(k.spec);
  }
  for (const [name, props] of Object.entries(nested)) {
    top[name] = {
      type: 'object',
      additionalProperties: false,
      properties: props,
    };
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment:
      'GENERATED from apps/api/src/common/ops/infra-switches.ts (UPDATE_INFRA_SCHEMA=1 npx jest infra-switches). Only these keys may ever be written to growth.auto.tfvars.json.',
    title: 'LawBid prod switches changed from the admin',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(top).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export interface PlanResource {
  address: string;
  /** terraform show -json actions joined with "-": create, update, delete, delete-create … */
  action: string;
}

/** An extra database server's module (`postgres_shard[N]` / its copies
 * `growth_shard[N]`) in a plan address, or null. */
export function shardModuleIndex(address: string): number | null {
  const m = /(^|\.)module\.(postgres_shard|growth_shard)\[(\d+)\]\./.exec(
    address,
  );
  return m ? Number(m[3]) : null;
}

/**
 * Addresses in [resources] that destroy something on FORBIDDEN_DESTROY.
 * Owner 2026-11-12 («Авто» both ways, like copies): a request that lowers
 * `db_shards` to K may remove the servers K and above — the API lets such a
 * request plan only while those servers hold no data (ShardMoveService.
 * emptyServers), and AWS keeps a final snapshot of each.
 */
export function forbiddenDestroys(
  resources: readonly PlanResource[],
  changes?: Readonly<Record<string, unknown>>,
): string[] {
  const keep = changes?.db_shards;
  return resources
    .filter((r) => r.action.includes('delete'))
    .filter((r) => {
      const hit = r.address
        .split('.')
        .some((part) => FORBIDDEN_DESTROY.includes(part.replace(/\[.*$/, '')));
      const n = shardModuleIndex(r.address);
      const removed =
        typeof keep === 'number' &&
        n !== null &&
        n >= keep &&
        r.action === 'delete';
      return (
        hit && !removed && !DESTROY_ALLOWED.some((re) => re.test(r.address))
      );
    })
    .map((r) => r.address);
}
