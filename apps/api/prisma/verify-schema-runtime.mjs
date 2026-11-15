// 15.11 (KNOWN_ERRORS 167): tables the app itself creates at run time,
// outside migrations, so the real database may hold them while schema.prisma
// does not. The partition runner (src/partitioning/partition-runner.ts)
// creates public._partition_job on its first conversion and, while a
// conversion or its undo window runs, <table>__part / <table>__old. Prisma
// reports them as «Removed tables» (schema.prisma would drop them). Only
// that — nothing else in the diff — is not a deploy blocker.
export const RUNTIME_TABLE = /^(_partition_job|[a-z0-9_]+__(part|old))$/;

/** True when the `prisma migrate diff` output lists nothing but removed
 * run-time tables. */
export function onlyRuntimeTables(out) {
  const lines = String(out)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(Loaded Prisma config|Prisma schema loaded|Datasource )/.test(l));
  let section = null;
  let seen = 0;
  for (const l of lines) {
    const head = l.match(/^\[[*+-]\]\s+(.+)$/);
    if (head) {
      section = head[1];
      if (section !== 'Removed tables') return false;
      continue;
    }
    const item = l.match(/^-\s+(\S+)$/);
    if (!item || section !== 'Removed tables') return false;
    if (!RUNTIME_TABLE.test(item[1])) return false;
    seen++;
  }
  return seen > 0;
}
