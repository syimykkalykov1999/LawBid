/** Redis key of the daily outside-usage snapshot (jobs/handlers/usage-poll.job.ts).
 * Its own file so readers (bootstrap) need not import the job. */
export const USAGE_SNAPSHOT_KEY = 'ops:usage:v1';
