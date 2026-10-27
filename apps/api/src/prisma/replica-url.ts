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
  const host = env.DB_REPLICA_HOST?.trim() || live?.trim();
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
