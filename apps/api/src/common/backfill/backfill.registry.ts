import type { BackfillDefinition } from './backfill.types';

/**
 * Every named backfill the CLI can run (`node dist/src/cli/backfill-runner.js
 * <name>`). A backfill ships together with the migration that adds its column
 * (expand), runs after the deploy, and is removed from here once finished in
 * production. Template and rules: docs/architecture/ONLINE_DDL.md §4.
 *
 * Example (kept as a comment so nothing runs by accident):
 *
 *   {
 *     name: '2026-11-cases-total-cents',
 *     description: 'cases.total_cents from cases.total_amount',
 *     table: 'cases',
 *     keyType: 'uuid',
 *     async apply(db, { lo, hi }) {
 *       return db.$executeRaw`
 *         UPDATE cases SET total_cents = round(total_amount * 100)
 *         WHERE ${keyRangeSql('id', 'uuid', lo, hi)} AND total_cents IS NULL`;
 *     },
 *   }
 */
export const BACKFILLS: readonly BackfillDefinition[] = [];

export function findBackfill(name: string): BackfillDefinition | undefined {
  return BACKFILLS.find((b) => b.name === name);
}
