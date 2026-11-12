import { replicaLive } from './replica-live';

/**
 * Read-replica address (docs/runbooks/db-replica.md).
 *
 * Two ways to point the lag-tolerant reads at a replica, both off by default:
 * 1. `DATABASE_REPLICA_URL` - a full URL (any managed replica);
 * 2. `DB_REPLICA_HOST` - only a host (Terraform sets it when
 *    `growth.rds_read_replicas > 0`): DATABASE_URL with the host swapped and
 *    the port 5432. Same role, password and database name, so no extra
 *    secret has to be filled by hand. The pooler is NOT used (DB_POOLER_HOST
 *    is ignored here): the replica is reached directly.
 * 3. the host the admin button created and the watcher found healthy
 *    (replica-live.ts), same host-swap as 2.
 * A full URL wins over a host. Neither set = undefined = the primary.
 */
export function resolveReplicaUrl(
  env: NodeJS.ProcessEnv = process.env,
  live: string | null = replicaLive.get(),
): string | undefined {
  const full = env.DATABASE_REPLICA_URL?.trim();
  if (full) return full;
  // Owner 2026-11-11: several copies come as "h1,h2,…"; this one is the first.
  const host =
    (env.DB_REPLICA_HOST?.split(',')[0] ?? '').trim() || live?.trim();
  const base = env.DATABASE_URL?.trim();
  if (!host || !base) return undefined;
  try {
    const url = new URL(base);
    url.hostname = host;
    url.port = env.DB_REPLICA_PORT?.trim() || '5432';
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Owner 2026-11-11 («Авто» by count): every read copy's URL. Terraform sets
 * DB_REPLICA_HOST to all copies, comma separated; reads are shared between
 * them (prisma-read.service.ts). One copy / a full URL = a list of one.
 */
export function resolveReplicaUrls(
  env: NodeJS.ProcessEnv = process.env,
  live: string | null = replicaLive.get(),
): string[] {
  const first = resolveReplicaUrl(env, live);
  if (!first) return [];
  if (env.DATABASE_REPLICA_URL?.trim()) return [first];
  const hosts = (env.DB_REPLICA_HOST ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const out = [first];
  for (const host of hosts.slice(1)) {
    try {
      const u = new URL(first);
      u.hostname = host;
      out.push(u.toString());
    } catch {
      /* a bad host is skipped */
    }
  }
  return out;
}
