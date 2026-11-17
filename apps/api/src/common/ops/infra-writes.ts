/**
 * Row 204 (detective R4B-2, 17.11): with Terraform `task_role_split` the
 * internet-facing api task runs under a role that may not change the
 * database, Redis, services, alarms or budgets, and its container carries
 * `OPS_INFRA_WRITES=off`. The loops that every API process starts and that
 * change infrastructure by themselves (ha-auto, the read-replica auto-check)
 * then stay off there; the api-admin service (same image, no flag) and the
 * worker run them under their own roles. Unset = on (local, CI, the old
 * shared role), so nothing changes until the split is applied.
 */
export function infraWritesOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.OPS_INFRA_WRITES ?? '').trim().toLowerCase() === 'off';
}
