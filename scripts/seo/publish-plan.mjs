#!/usr/bin/env node
// Publish plan for seo-deploy.yml: which files changed since the last
// published run (content hashes), which are gone, and which CloudFront
// paths to reset (at most 30 a day, never `/*`). It only reads files and
// writes the plan; the workflow runs the AWS commands.
//
//   node scripts/seo/publish-plan.mjs --dir dist-seo --prev prev-manifest.json \
//        --plan plan [--max-invalidations 30] [--date 2026-10-27] [--dry-run]
//        [--allow-mass-delete]
//
// Writes into --plan: upload.txt (one path per line), delete-<n>.json
// (batches for `aws s3api delete-objects`), invalidate.txt (one path per
// line) and plan.json. Unless --dry-run, it also writes the final
// seo-manifest.json into --dir (uploaded LAST, so a failed run is simply
// planned again). Exit code 3 (nothing written): the plan would remove more
// than 30% of the published files (and over 100), e.g. after an empty API
// answer; pass --allow-mass-delete once a person has looked.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAX_INVALIDATIONS, MANIFEST_NAME, deleteBatches, hashDir, planPublish } from './lib/manifest.mjs';

const readJson = async (f) => {
  if (!f) return null;
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return null; // no previous manifest: everything is new
  }
};

export async function makePlan({ dir, prev, today, maxInvalidations = DEFAULT_MAX_INVALIDATIONS }) {
  const files = await hashDir(dir);
  const built = (await readJson(join(dir, MANIFEST_NAME))) ?? {};
  return planPublish({ files, prev, today, maxInvalidations, built });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const dir = arg('dir', 'dist-seo');
  const planDir = arg('plan', 'seo-plan');
  const today = arg('date', new Date().toISOString().slice(0, 10));
  const dry = argv.includes('--dry-run');
  const max = Number.parseInt(arg('max-invalidations', String(DEFAULT_MAX_INVALIDATIONS)), 10);
  const prev = await readJson(arg('prev', ''));
  const r = await makePlan({ dir, prev, today, maxInvalidations: Number.isFinite(max) ? max : DEFAULT_MAX_INVALIDATIONS });
  await mkdir(planDir, { recursive: true });
  if (r.massDelete && !dry && !argv.includes('--allow-mass-delete')) {
    console.error(`publish plan REFUSED: it would remove ${r.remove.length} files (over 30% of the published ones). Look at the data, then run again with --allow-mass-delete.`);
    process.exit(3);
  }
  await writeFile(join(planDir, 'upload.txt'), r.upload.length ? `${r.upload.join('\n')}\n` : '');
  await writeFile(join(planDir, 'invalidate.txt'), r.invalidate.length ? `${r.invalidate.join('\n')}\n` : '');
  const batches = deleteBatches(r.remove);
  for (const [i, b] of batches.entries()) await writeFile(join(planDir, `delete-${i + 1}.json`), JSON.stringify(b));
  const summary = { upload: r.upload.length, unchanged: r.unchanged, remove: r.remove.length, invalidate: r.invalidate, skippedInvalidations: r.skippedInvalidations, massDelete: r.massDelete, firstRun: !prev, dryRun: dry };
  await writeFile(join(planDir, 'plan.json'), JSON.stringify(summary, null, 2));
  if (!dry) await writeFile(join(dir, MANIFEST_NAME), JSON.stringify(r.manifest));
  console.log(`publish plan${dry ? ' (dry run)' : ''}: upload ${summary.upload}, unchanged ${summary.unchanged}, remove ${summary.remove}, reset ${r.invalidate.length} path(s)${r.skippedInvalidations ? `, ${r.skippedInvalidations} left to the cache lifetime` : ''}`);
}
