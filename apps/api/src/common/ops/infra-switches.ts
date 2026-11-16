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

/**
 * Owner 15.11 («сделай в админке максимальное число серверов базы, чтобы
 * "Авто" добавляло пятый, шестой и дальше»): database servers = the primary
 * plus the extra servers of the split (Terraform `db_shards`, rows
 * `aws.db_shards`, `aws.db_shards_2`, …). DB_SERVERS_HARD_MAX is the code's
 * hard bound (the primary + 15 extra, as RDS allows 15 read replicas per
 * source; the account's default RDS quota is 40 instances per Region, AWS
 * Service Quotas «DB instances»). How many «Авто» may reach is the owner's
 * setting `db.max_servers` (default DB_SERVERS_DEFAULT = 4 = as before).
 * The same numbers live in cost-registry.ts (no imports there);
 * infra-switches.spec checks they match.
 */
export const DB_SERVERS_HARD_MAX = 16;
export const DB_SERVERS_DEFAULT = 4;

/** Row id of the [n]-th extra database server (1 = the second server). */
export function dbServerRowId(n: number): string {
  return n === 1 ? 'aws.db_shards' : `aws.db_shards_${n}`;
}

/** Every extra-server row, in order (the second server first). */
export const DB_SERVER_ROWS: readonly string[] = Array.from(
  { length: DB_SERVERS_HARD_MAX - 1 },
  (_, i) => dbServerRowId(i + 1),
);

/** 1-based index of an extra-server row (`aws.db_shards_3` = 3), or null. */
export function dbServerIndex(id: string): number | null {
  const n = DB_SERVER_ROWS.indexOf(id);
  return n < 0 ? null : n + 1;
}

/** The stored `db.max_servers` as a whole number in 1..DB_SERVERS_HARD_MAX
 * (anything unreadable = DB_SERVERS_DEFAULT). */
export function maxDbServers(raw: unknown): number {
  const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof v !== 'number' || !Number.isFinite(v)) return DB_SERVERS_DEFAULT;
  return Math.min(DB_SERVERS_HARD_MAX, Math.max(1, Math.floor(v)));
}

/**
 * Owner 15.11 (look frozen: with the default 4 «Масштаб» shows exactly the
 * three server rows it showed before): a server row is shown while the
 * servers it brings stay inside `db.max_servers`, or while that server runs
 * (so a server above a lowered maximum can still be seen and removed).
 * Every other row is always shown.
 */
export function dbServerRowShown(
  id: string,
  liveState: string | null | undefined,
  maxServers: unknown,
): boolean {
  const n = dbServerIndex(id);
  if (n === null) return true;
  return n + 1 <= maxDbServers(maxServers) || liveState === 'on';
}

/** Russian ordinal of the [n]-th server in all (5 = «пятый»). */
const SERVER_ORDINAL: readonly string[] = [
  '',
  'первый',
  'второй',
  'третий',
  'четвёртый',
  'пятый',
  'шестой',
  'седьмой',
  'восьмой',
  'девятый',
  'десятый',
  'одиннадцатый',
  'двенадцатый',
  'тринадцатый',
  'четырнадцатый',
  'пятнадцатый',
  'шестнадцатый',
];

/** Switches of the extra servers past the fourth server (rows 4..15). */
function moreServerSwitches(): InfraSwitch[] {
  const out: InfraSwitch[] = [];
  for (let n = 4; n < DB_SERVERS_HARD_MAX; n++) {
    out.push({
      id: dbServerRowId(n),
      values: { off: { db_shards: n - 1 }, on: { db_shards: n } },
      impact: `Без перерыва: ${SERVER_ORDINAL[n + 1]} сервер создаётся 15–40 минут и стоит пустым; при следующей выкладке на нём сами появляются схема и роли. Данные переезжают ночью сами (Авто) или по кнопке.`,
    });
  }
  return out;
}

/** The object in the JSON file that holds `growth.<k>` keys. */
export const GROWTH_CONTAINER = 'growth_switches';

/**
 * Owner 15.11 («максимум узлов поиска в админке, "Авто" дальше четырёх»):
 * data nodes of the search domain. The steps go +2 (1 -> 2 -> 4 -> 6 -> 8
 * -> 10): the domain runs in two Availability Zones and AWS «Configuring a
 * multi-AZ domain» wants the data node count to be a multiple of the zone
 * count, so every step keeps both zones equal. No dedicated master nodes:
 * AWS recommends three of them for production, but at this size they would
 * cost more than the data nodes they coordinate (owner: cheapest start);
 * the data nodes elect the cluster manager among themselves.
 * SEARCH_NODES_HARD_MAX is the AWS «Total node limit by instance family»
 * for T2/T3 (10 nodes, OpenSearch Service quotas, every engine version);
 * the domain runs t3.small.search. How far «Авто» may go is the owner's
 * setting `search.max_nodes` (default SEARCH_NODES_DEFAULT = 4 = as before).
 * The same numbers live in cost-registry.ts (no imports there);
 * infra-switches.spec checks they match.
 */
export const SEARCH_NODES_STEP = 2;
export const SEARCH_NODES_HARD_MAX = 10;
export const SEARCH_NODES_DEFAULT = 4;

/** Row id of the step that brings the domain to [count] nodes
 * (1 = the domain itself, `aws.opensearch`). */
export function searchNodeRowId(count: number): string {
  return count === 1 ? 'aws.opensearch' : `aws.opensearch_nodes_${count}`;
}

/** Node counts of the steps, in order: 1, 2, 4, 6, 8, 10. */
export const SEARCH_NODE_COUNTS: readonly number[] = [
  1,
  ...Array.from(
    { length: SEARCH_NODES_HARD_MAX / SEARCH_NODES_STEP },
    (_, i) => (i + 1) * SEARCH_NODES_STEP,
  ),
];

/** The search ladder rows, in order (the domain first). */
export const SEARCH_NODE_ROWS: readonly string[] =
  SEARCH_NODE_COUNTS.map(searchNodeRowId);

/** Nodes the domain has with row [id] on, or null for another row. */
export function searchNodeCount(id: string): number | null {
  const i = SEARCH_NODE_ROWS.indexOf(id);
  return i < 0 ? null : SEARCH_NODE_COUNTS[i];
}

/** The stored `search.max_nodes` as a node count «Авто» may reach: a whole
 * number in 1..SEARCH_NODES_HARD_MAX, odd counts above 1 rounded down to the
 * even step below (5 -> 4); anything unreadable = SEARCH_NODES_DEFAULT. */
export function maxSearchNodes(raw: unknown): number {
  const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof v !== 'number' || !Number.isFinite(v)) return SEARCH_NODES_DEFAULT;
  const n = Math.min(SEARCH_NODES_HARD_MAX, Math.max(1, Math.floor(v)));
  return n === 1 ? 1 : n - (n % SEARCH_NODES_STEP);
}

/**
 * Look frozen: with the default 4 «Масштаб» shows exactly the search rows it
 * showed before. A node step past 4 is shown while it stays inside
 * `search.max_nodes`, or while it is on (so it can still be seen and taken
 * back after the maximum was lowered). Every other row is always shown.
 */
export function searchNodeRowShown(
  id: string,
  liveState: string | null | undefined,
  maxNodes: unknown,
): boolean {
  const n = searchNodeCount(id);
  if (n === null) return true;
  return (
    n <= SEARCH_NODES_DEFAULT ||
    n <= maxSearchNodes(maxNodes) ||
    liveState === 'on'
  );
}

/** Switches of the node steps past four nodes (6, 8, 10). */
function moreSearchNodeSwitches(): InfraSwitch[] {
  const out: InfraSwitch[] = [];
  for (const n of SEARCH_NODE_COUNTS) {
    if (n <= SEARCH_NODES_DEFAULT) continue;
    out.push({
      id: searchNodeRowId(n),
      values: {
        off: { 'growth.opensearch_instance_count': n - SEARCH_NODES_STEP },
        on: { 'growth.opensearch_instance_count': n },
      },
      impact: `Без перерыва: AWS сам переносит поиск на ${n} узлов (по ${n / 2} в каждой зоне, сине-зелёная замена, 20–60 минут); поиск работает всё время.`,
    });
  }
  return out;
}

/**
 * Every key the admin may write. Top-level names are variables of
 * infra/envs/prod/variables.tf; `growth.<k>` keys go to the
 * `growth_switches` object (infra/envs/prod/growth.tf), merged over
 * `growth` from terraform.tfvars, so a growth line there is not lost.
 */
export const INFRA_KEYS: Readonly<Record<string, InfraKey>> = {
  waf_enabled: bool('waf_enabled'),
  // Owner 15.11: carries the «apply the autoscale functions' code» request
  // (flips every round); no Terraform resource uses it.
  autoscale_code_flip: bool('autoscale_code_flip'),
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
  // Owner 2026-11-12 (row 67): Spot for every ECS service.
  api_admin_spot: bool('api_admin_spot'),
  admin_spot: bool('admin_spot'),
  pgbouncer_spot: bool('pgbouncer_spot'),
  // Owner 15.11: up to DB_SERVERS_HARD_MAX servers in all (the primary +
  // 15 extra); how many «Авто» may reach is the setting db.max_servers.
  db_shards: int(['db_shards'], 0, DB_SERVERS_HARD_MAX - 1),
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
  // domain. Two Availability Zones in prod = 1 or an even count (AWS wants a
  // multiple of the zone count; modules/stack/growth.tf refuses odd ones).
  // Owner 15.11: up to SEARCH_NODES_HARD_MAX (AWS T3 limit); how far «Авто»
  // goes is the setting search.max_nodes.
  'growth.opensearch_instance_count': int(
    [GROWTH_CONTAINER, 'opensearch_instance_count'],
    1,
    SEARCH_NODES_HARD_MAX,
  ),
  // Owner 15.11 «обнови всё до новейшего»: the search engine version, one
  // AWS hop per apply (2.15 -> 2.19 -> 3.7, modules/growth/main.tf).
  'growth.opensearch_engine_version': {
    path: [GROWTH_CONTAINER, 'opensearch_engine_version'],
    spec: {
      type: 'choice',
      values: ['OpenSearch_2.15', 'OpenSearch_2.19', 'OpenSearch_3.7'],
    },
  },
  // G4 (2026-11-08): the Kinesis stream the `events.sink = auto` switch needs.
  'growth.events_stream_enabled': {
    path: [GROWTH_CONTAINER, 'events_stream_enabled'],
    spec: { type: 'boolean' },
  },
  // G5 (2026-11-08): the separate cache Redis `cache.redis_mode = auto` uses.
  redis_cache_node: bool('redis_cache_node'),
  // Owner 15.11 «делай обновы сейчас»: PostgreSQL 16 -> 18 by AWS Blue/Green
  // (infra-apply.yml + scripts/infra/rds-major-upgrade.sh) and Redis OSS ->
  // Valkey 9.1 in place.
  database_major_version: choice('database_major_version', ['16', '18']),
  redis_engine: choice('redis_engine', ['redis', 'valkey']),
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
    // Owner 15.11 («разреши "Авто" само применять обновления кода своих
    // функций без меня»): AUTO_SCOPE allows only in-place updates of the
    // four autoscale Lambdas; the flag only makes the request a file change.
    id: 'aws.autoscale_code',
    values: {
      off: { autoscale_code_flip: false },
      on: { autoscale_code_flip: true },
    },
    impact:
      'Без перерыва: обновляется только код функций автомасштаба (Redis, база, точки доступа, Spot).',
  },
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
  // Owner 15.11: the fifth server and on (db.max_servers decides how far).
  ...moreServerSwitches(),
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
  // Owner 15.11: six, eight and ten nodes (search.max_nodes decides how far).
  ...moreSearchNodeSwitches(),
  {
    id: 'aws.opensearch_2_19',
    values: {
      off: { 'growth.opensearch_engine_version': 'OpenSearch_2.15' },
      on: { 'growth.opensearch_engine_version': 'OpenSearch_2.19' },
    },
    impact:
      'Без перерыва: AWS обновляет поиск на месте (проверка, снимок, сине-зелёная замена, от 15 минут до нескольких часов); поиск работает всё время. Назад нельзя: план с заменой движка админка откажет.',
  },
  {
    id: 'aws.opensearch_3',
    values: {
      off: { 'growth.opensearch_engine_version': 'OpenSearch_2.19' },
      on: { 'growth.opensearch_engine_version': 'OpenSearch_3.7' },
    },
    impact:
      'Только после «Поиск 2.19». Без перерыва: AWS обновляет поиск на месте до 3.7 (проверка, снимок, сине-зелёная замена, от 15 минут до нескольких часов); поиск работает всё время. Назад нельзя: план с заменой движка админка откажет.',
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
    id: 'aws.postgres_major',
    values: {
      off: { database_major_version: '16' },
      on: { database_major_version: '18' },
    },
    impact:
      'Одна перезагрузка базы (около минуты), потом 20–60 минут готовится копия на 18 (приложение работает), потом около минуты без базы при переключении. Старая база остаётся как lawbid-prod-postgres-old1. Во время обновления не выкатывать новую версию приложения.',
  },
  {
    id: 'aws.valkey',
    values: {
      off: { redis_engine: 'redis' },
      on: { redis_engine: 'valkey' },
    },
    impact:
      'Без перерыва: AWS меняет Redis на Valkey на месте, записи в очереди замирают на несколько секунд. Обратно (Выкл) план откажет: это пересоздание Redis.',
  },
  {
    id: 'aws.graviton_spot',
    values: {
      off: {
        cpu_architecture: 'X86_64',
        api_spot: false,
        worker_spot: false,
        api_admin_spot: false,
        admin_spot: false,
        pgbouncer_spot: false,
      },
      // 12.11 (KNOWN_ERRORS 119): turning Spot on changes launch_type, so the
      // AWS provider recreates the ECS services (minutes of downtime). The
      // owner chose to take that once now, before launch, with no users.
      // Row 67 (12.11): all five services (api, api-admin, admin, worker,
      // pgbouncer), one regular task each + FARGATE 1 : FARGATE_SPOT 4;
      // modules/spot-fallback moves a service to regular Fargate while Spot
      // has no capacity and back afterwards.
      on: {
        cpu_architecture: 'ARM64',
        api_spot: true,
        worker_spot: true,
        api_admin_spot: true,
        admin_spot: true,
        pgbouncer_spot: true,
      },
    },
    impact:
      'Первое включение Spot пересоздаёт пять сервисов (API, API админки, админка, фоновые задачи, пул базы): несколько минут простоя, делать до запуска. Дальше без перерыва. Нужен образ для ARM (выкат делает его сам).',
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

/**
 * Resource types a plan from the admin may delete (switch off) but NEVER
 * replace. Owner 15.11: the AWS provider replaces an OpenSearch domain when
 * the new engine_version is not a direct AWS upgrade target (skipped hop or
 * a downgrade, provider 6.72 domain.go ForceNewIf), which would drop every
 * index (KNOWN_ERRORS 178). The workflow and the API both check this.
 */
export const FORBIDDEN_REPLACE: readonly string[] = ['aws_opensearch_domain'];

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
      const parts = r.address.split('.').map((p) => p.replace(/\[.*$/, ''));
      if (
        r.action.includes('create') &&
        parts.some((p) => FORBIDDEN_REPLACE.includes(p))
      ) {
        return true;
      }
      const hit = parts.some((part) => FORBIDDEN_DESTROY.includes(part));
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
