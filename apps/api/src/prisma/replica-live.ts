/**
 * The host of the admin-managed read replica, as the running process knows
 * it right now (null = reads go to the primary). `ReplicaAdminService`
 * refreshes it every 30 s from RDS + CloudWatch and clears it on its own
 * when the replica is gone, still being created, or more than a few seconds
 * behind. `PrismaReadService` reads it on every call, so the switch needs no
 * deploy and no restart.
 */
let host: string | null = null;

export const replicaLive = {
  get: (): string | null => host,
  set: (h: string | null): void => {
    host = h && h.length > 0 ? h : null;
  },
};
