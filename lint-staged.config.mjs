// Pre-commit (husky -> lint-staged). Conflict-proof shared files (owner rule
// 2026-10-27, WORKER_BUILD_RULES «параллельные волны без конфликтов»): the
// generated / sorted shared registries are produced HERE, not by hand, so a
// PR never commits a stale contract or an unsorted list.
//
// Lint only the staged API files (the whole-tree `npm run lint` took minutes
// and up to 8 GB per commit and froze the Mac when several ran at once).
// `npm exec --workspace apps/api` runs ESLint from apps/api so its flat
// config and type-aware parser options apply.
const quote = (f) => `'${f.replace(/'/g, "'\\''")}'`;

/** DTOs and controllers are the only sources of the OpenAPI contract. */
export const CONTRACT_SOURCE = /apps\/api\/src\/.*\.(dto|controller)\.ts$/;
/** Files that can change the module import graph (arch:baseline). */
export const MODULE_SOURCE = /apps\/api\/src\/modules\/.*\.ts$/;

/** Generated contract outputs that must be staged with the change. */
export const CONTRACT_OUTPUTS = [
  "packages/api-contract/openapi.json",
  "packages/api-contract/dart/lib",
];
export const BASELINE_FILE =
  "apps/api/src/architecture/module-boundaries.baseline.json";

/**
 * Tasks for the staged API TypeScript files, in ONE sequential list (lint-
 * staged runs different globs in parallel, and eslint --fix must finish
 * before the contract is generated from the same sources).
 */
export function apiTypeScriptTasks(files) {
  const tasks = [
    `npm exec --workspace apps/api -- eslint --fix --no-warn-ignored ${files.map(quote).join(" ")}`,
  ];
  if (files.some((f) => MODULE_SOURCE.test(f))) {
    // Prunes fixed deep imports / lowers fan-out; exits 1 with a diff on an
    // UNAPPROVED new deep import or fan-out growth (then run it with
    // `-- --approve` on purpose and review the diff).
    tasks.push(
      "npm run arch:baseline --workspace apps/api",
      `git add ${BASELINE_FILE}`,
    );
  }
  if (files.some((f) => CONTRACT_SOURCE.test(f))) {
    // SKIP_CONTRACT_HOOK=1 is only for a machine without Postgres/Redis/dart;
    // CI still fails a stale contract (drift check).
    tasks.push(
      "sh -c '[ \"${SKIP_CONTRACT_HOOK:-0}\" = 1 ] || npm run contract:fast'",
      `git add ${CONTRACT_OUTPUTS.join(" ")}`,
    );
  }
  return tasks;
}

/** Sorted shared lists (apps/api/scripts/sort-lists.mjs). */
export const SORTED_LISTS = [
  "apps/api/test/two-db-suites.json",
  "apps/api/src/redis/redis-cluster-scan.allowlist.json",
  "apps/api/src/sharding/cross-family-include.allowlist.json",
  "apps/api/src/architecture/admin-heavy-queries.baseline.json",
  "docs/dev/SWITCH_INVENTORY.md",
];

export default {
  "apps/api/**/*.ts": apiTypeScriptTasks,
  [`{${SORTED_LISTS.join(",")}}`]: () =>
    "npm run lists:sort --workspace apps/api",
};
