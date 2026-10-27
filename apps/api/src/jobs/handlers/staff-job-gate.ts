/**
 * Staff package T1: shared shape of the `staff.*` cron jobs (plan B5). Each
 * job reads its switch first; while the switch is off it returns at once —
 * no query, no Redis write, no call out. The bodies are filled by the task
 * that owns each job file (see the header of each `staff-*.job.ts`).
 */
export type StaffJobResult =
  | { skipped: 'off' | 'not built yet' }
  | Record<string, number | string | boolean>;

/** The switch of this job is off (the default). */
export const STAFF_JOB_OFF = { skipped: 'off' } as const;
/** The switch is on but the body is not built yet: still nothing is done. */
export const STAFF_JOB_STUB = { skipped: 'not built yet' } as const;
