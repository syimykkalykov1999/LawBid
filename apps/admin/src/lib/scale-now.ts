import type { components } from '@/lib/api/schema';
import type { CostRegistryRow } from '@/lib/launch';
import { searchLine, type Economy, type ScaleExtras } from '@/lib/scale';

/**
 * Owner 15.11 («напротив авто чтобы показывали скока серверов или баз и тд
 * включено»): one short «Сейчас: …» line next to every «Авто» row of
 * «Масштаб». Only data the page already loads: the cached economy report
 * (ECS services, database / Redis from the capacity snapshot), the scale
 * extras and the cost registry (what each cloud row runs now). No request
 * of its own. Pure, tested in scale-now.test.ts.
 */
type ServiceNow = components['schemas']['ServiceNowDto'];
export type TuningTargetId = 'db' | 'redis' | 'endpoints' | 'ecs' | 'spot';

export interface NowFacts {
  rows?: readonly CostRegistryRow[];
  economy?: Economy;
  extras?: ScaleExtras;
}

const SERVICE_NAMES: Record<ServiceNow['kind'], string> = {
  api: 'API',
  worker: 'фоновые',
  api_admin: 'API админки',
  admin: 'админка',
  pgbouncer: 'PgBouncer',
};

const live = (f: NowFacts, id: string) => f.rows?.find((r) => r.id === id)?.liveState ?? null;
const onOff = (v: 'on' | 'off' | null, on: string, off: string) => (v === 'on' ? on : v === 'off' ? off : null);

/** «API 2 из 2» = tasks running of the tasks wanted. */
function serviceText(s: ServiceNow): string {
  return `${SERVICE_NAMES[s.kind]} ${s.running} из ${s.desired}`;
}

/** Copies the database has now: the snapshot's count (AWS), else the rows. */
function readCopies(f: NowFacts): number | null {
  const n = f.economy?.capacity.replicaCount;
  if (typeof n === 'number') return n;
  return chain(f, ['aws.rds_replicas', 'aws.rds_replicas_2', 'aws.rds_replicas_3', 'aws.rds_replicas_4', 'aws.rds_replicas_5']);
}

/** Rows that add one more of a thing (N-th copy, N-th server): how many are
 * on in a row from the first. null = nothing is known about the first. */
function chain(f: NowFacts, ids: readonly string[]): number | null {
  if (live(f, ids[0]) === null) return null;
  let n = 0;
  for (const id of ids) {
    if (live(f, id) !== 'on') break;
    n += 1;
  }
  return n;
}

function dbServers(f: NowFacts): number | null {
  const extra = chain(f, ['aws.db_shards', 'aws.db_shards_2', 'aws.db_shards_3']);
  return extra === null ? null : 1 + extra;
}

function searchNodes(f: NowFacts): number | null {
  const domain = live(f, 'aws.opensearch');
  if (domain !== 'on') return domain === 'off' ? 0 : null;
  if (live(f, 'aws.opensearch_nodes_4') === 'on') return 4;
  if (live(f, 'aws.opensearch_nodes_2') === 'on') return 2;
  return 1;
}

function spotText(services: readonly ServiceNow[]): string | null {
  const known = services.filter((s) => s.spot !== null);
  if (known.length === 0) return null;
  const spot = known.filter((s) => s.spot).map((s) => SERVICE_NAMES[s.kind]);
  const plain = known.filter((s) => !s.spot).map((s) => SERVICE_NAMES[s.kind]);
  return [spot.length ? `на Spot: ${spot.join(', ')}` : null, plain.length ? `обычные: ${plain.join(', ')}` : null]
    .filter(Boolean)
    .join('; ');
}

const yes = (v: boolean | null | undefined, on: string, off: string) => (v === true ? on : v === false ? off : null);

function line(parts: (string | null | undefined)[]): string {
  const p = parts.filter((x): x is string => !!x);
  return `Сейчас: ${p.length ? p.join(', ') : 'нет данных'}`;
}

/** The «Сейчас» line of a cloud row (Облако: Выкл / Вкл / Авто). */
export function cloudNow(id: string, f: NowFacts): string {
  const services = f.economy?.containers.services ?? [];
  const cap = f.economy?.capacity;
  const st = live(f, id);
  if (id.startsWith('aws.rds_replicas')) {
    const n = readCopies(f);
    return line([n === null ? null : `копий базы для чтения: ${n}`]);
  }
  if (id.startsWith('aws.db_shards')) {
    const n = dbServers(f);
    return line([n === null ? null : `серверов базы: ${n}`]);
  }
  if (id.startsWith('aws.opensearch')) {
    const n = searchNodes(f);
    return line([
      n === null ? null : n === 0 ? 'движок поиска выключен' : `движок поиска включён, узлов: ${n}`,
      f.extras ? `ищет ${searchLine(f.extras.searchEngine)}` : null,
    ]);
  }
  if (id.startsWith('aws.waf')) return line([onOff(st, 'правила WAF включены', 'правила WAF выключены')]);
  if (id === 'aws.events_stream') return line([onOff(st, 'поток Kinesis включён', 'поток Kinesis выключен')]);
  if (id === 'aws.redis_cache') return line([onOff(st, 'отдельный Redis для кэша включён', 'отдельного Redis для кэша нет')]);
  if (id === 'aws.pgbouncer') {
    const s = services.find((x) => x.kind === 'pgbouncer');
    return line([s ? `PgBouncer ${s.running} из ${s.desired}` : onOff(st, 'PgBouncer включён', 'PgBouncer выключен')]);
  }
  if (id === 'aws.ha_extras') {
    const api = services.find((x) => x.kind === 'api');
    return line([
      yes(cap?.dbMultiAz, 'запасная копия базы в другой зоне есть', 'запасной копии базы в другой зоне нет'),
      onOff(st, 'запас включён', 'запас выключен'),
      api ? serviceText(api) : null,
    ]);
  }
  if (id === 'aws.graviton_spot') return line([spotText(services) ?? onOff(st, 'Spot включён', 'Spot выключен')]);
  return line([onOff(st, 'включено', 'выключено')]);
}

/** The «Сейчас» line of a card in «Числа «Авто»». */
export function tuningNow(target: TuningTargetId, f: NowFacts): string {
  const cap = f.economy?.capacity;
  const services = f.economy?.containers.services ?? [];
  switch (target) {
    case 'redis':
      return line([
        cap?.redisClass ?? null,
        typeof cap?.redisNodes === 'number' ? `узлов: ${cap.redisNodes}` : null,
      ]);
    case 'db': {
      const copies = readCopies(f);
      const servers = dbServers(f);
      return line([
        cap?.dbClass ?? null,
        yes(cap?.dbMultiAz, 'запасная копия в другой зоне есть', 'запасной копии в другой зоне нет'),
        copies === null ? null : `копий для чтения: ${copies}`,
        servers === null ? null : `серверов базы: ${servers}`,
      ]);
    }
    case 'endpoints':
      // The endpoint function keeps its own count; the API cannot read it yet.
      return 'Сейчас: число точек доступа сервер пока не видит (их считает сама функция «Авто»)';
    case 'ecs': {
      const spot = spotText(services);
      return services.length
        ? `Сейчас (работает из нужных): ${services.map(serviceText).join(', ')}${spot ? `; ${spot}` : ''}`
        : line([]);
    }
    case 'spot':
      // #1120: the spot-fallback card; the same split the Spot row shows.
      return line([spotText(services)]);
  }
}
