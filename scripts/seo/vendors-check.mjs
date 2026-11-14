#!/usr/bin/env node
// D1-52 (13.11): the company site's Third-Party Services page
// (repository LawBidSite, src/app/(site)/(legal)/third-party-services/page.tsx)
// must name every outside service the server sends user data to. Each entry
// there lists the provider-registry ids it covers (`registry: [...]`); this
// check compares them with apps/api/src/common/secrets/provider-registry.ts.
// A new provider in the registry fails the publish until it is either listed
// on the page or added to NO_USER_DATA below with the reason.
//
// Usage: node scripts/seo/vendors-check.mjs --page site/src/app/(site)/(legal)/third-party-services/page.tsx
import { readFile } from 'node:fs/promises';

/** Registry ids that never receive personal data (with the reason). */
export const NO_USER_DATA = {
  pagerduty: 'ops alerts about the servers, no user data',
  github: 'the code repository (deploy status), no user data',
  github_infra: 'infrastructure runs, no user data',
  cockroach_cloud: 'read-only backup-age check of a database cloud; production runs on Amazon RDS',
  ny_registry: 'public New York State open-data registry (a government source, not a service provider)',
};

/** Top-level provider ids of the registry source. */
export function registryIds(source) {
  return [...source.matchAll(/^ {4}id: '([a-z0-9_]+)',$/gm)].map((m) => m[1]);
}

/** Ids the page lists in its `registry: [...]` fields. */
export function pageIds(source) {
  const out = [];
  for (const m of source.matchAll(/registry:\s*\[([^\]]*)\]/g)) {
    for (const id of m[1].matchAll(/"([a-z0-9_]+)"/g)) out.push(id[1]);
  }
  return out;
}

export function compare(registry, page) {
  const listed = new Set(page);
  const known = new Set(registry);
  return {
    missing: registry.filter((id) => !listed.has(id) && !(id in NO_USER_DATA)),
    unknown: page.filter((id) => !known.has(id)),
  };
}

if (process.argv[1] && process.argv[1].endsWith('vendors-check.mjs')) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--page');
  const pagePath = i >= 0 ? argv[i + 1] : null;
  if (!pagePath) {
    console.error('usage: vendors-check.mjs --page <third-party-services/page.tsx>');
    process.exit(2);
  }
  const registry = registryIds(
    await readFile(new URL('../../apps/api/src/common/secrets/provider-registry.ts', import.meta.url), 'utf8'),
  );
  const { missing, unknown } = compare(registry, pageIds(await readFile(pagePath, 'utf8')));
  for (const id of missing) {
    console.log(`::error::Third-Party Services page does not list the provider "${id}" (provider-registry.ts)`);
  }
  for (const id of unknown) {
    console.log(`::error::Third-Party Services page lists "${id}", which is not in provider-registry.ts`);
  }
  if (missing.length + unknown.length > 0) process.exit(1);
  console.log(`vendors: all ${registry.length} registry providers are covered`);
}
