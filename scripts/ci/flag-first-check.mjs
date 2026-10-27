#!/usr/bin/env node
// S11-13: "ship dark, ramp by percentage". A PR that adds a user-facing route
// (a new @Get/@Post/@Put/@Patch/@Delete in a *.controller.ts) must either touch a
// feature flag in the same diff (isEnabled(...) / a flag key / feature-flags
// module) or carry the waiver comment `// flag: none <why>` on an added line.
// Without it the route is live for everybody the moment the deploy finishes.
// Admin controllers (modules/admin-*), health and openapi are exempt.
//
//   node scripts/ci/flag-first-check.mjs <base ref or sha> [--enforce]
// Default is advisory (annotations, exit 0) so a rollout of this rule cannot
// block the queue; the repository variable FLAG_FIRST_ENFORCE=true (or
// --enforce) makes a missing flag a failure.
import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base) {
  console.error('usage: flag-first-check.mjs <base> [--enforce]');
  process.exit(2);
}
const enforce = process.argv.includes('--enforce') || process.env.FLAG_FIRST_ENFORCE === 'true';
const diff = execFileSync('git', ['diff', '--unified=0', `${base}...HEAD`, '--', 'apps/api/src'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

export function analyse(diffText) {
  const routes = [];
  let file = '';
  let flagTouched = false;
  let waiver = '';
  for (const line of diffText.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line);
    if (f) {
      file = f[1];
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);
    if (file.endsWith('.spec.ts') || file.includes('/test/')) continue;
    if (/\bflag:\s*none\b\s*\S+/i.test(added)) waiver = added.trim();
    if (/\b(isEnabled|isFlagEnabled|featureFlags?\b|FeatureFlagsService|flagKey|flag-catalog)/.test(added)) flagTouched = true;
    const exempt = /modules\/(admin[-\w]*|health|openapi)\//.test(file) || !file.endsWith('.controller.ts');
    if (!exempt && /^\s*@(Get|Post|Put|Patch|Delete)\(/.test(added)) routes.push(`${file}: ${added.trim()}`);
  }
  return { routes, flagTouched, waiver };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = analyse(diff);
  if (r.routes.length === 0) {
    console.log('no new user-facing route: flag-first not applicable');
    process.exit(0);
  }
  if (r.flagTouched || r.waiver) {
    console.log(`flag-first ok: ${r.flagTouched ? 'a feature flag is touched in this diff' : `waiver "${r.waiver}"`}`);
    process.exit(0);
  }
  const msg =
    `${r.routes.length} new route(s) without a feature flag:\n  ${r.routes.slice(0, 8).join('\n  ')}\n` +
    'Gate the feature with a flag (apps/api/src/modules/feature-flags, default OFF / low percent) or add the waiver comment ' +
    '`// flag: none <why this may go live to everyone>` on an added line.';
  console.error(`::${enforce ? 'error' : 'warning'}::${msg.replace(/\n/g, '%0A')}`);
  process.exit(enforce ? 1 : 0);
}
