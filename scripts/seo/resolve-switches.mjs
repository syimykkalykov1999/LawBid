// Owner 2026-10-27: the SEO switches the owner sets on the admin page
// «Продвижение» are the source of truth for the static-page workflow.
//
//   node scripts/seo/resolve-switches.mjs --api https://api.example.com/api/v1 >> "$GITHUB_ENV"
//
// For every switch: the value stored in the admin (GET <api>/public/seo-settings)
// wins; where the admin never decided (null), or the API cannot be reached,
// the repository variable of the same name decides (passed in as
// VAR_SEO_SITEMAP_INDEX, VAR_SEO_ROBOTS_AI, ... by seo-deploy.yml). Prints
// NAME=value lines for $GITHUB_ENV (booleans as 1 or empty, the ramp as a
// number) and the source of each switch to stderr. It never fails the build.
import { fileURLToPath } from 'node:url';

/** admin field -> env name read by build.mjs / the workflow. */
export const SWITCHES = [
  { field: 'incremental', env: 'SEO_INCREMENTAL', kind: 'bool' },
  { field: 'sitemapIndex', env: 'SEO_SITEMAP_INDEX', kind: 'bool' },
  { field: 'robotsAi', env: 'SEO_ROBOTS_AI', kind: 'bool' },
  { field: 'llms', env: 'SEO_LLMS', kind: 'bool' },
  { field: 'qualityGate', env: 'SEO_QUALITY_GATE', kind: 'bool' },
  { field: 'rampPerDay', env: 'SEO_RAMP_PER_DAY', kind: 'int' },
];

const fromVar = (kind, raw) => {
  const v = (raw ?? '').trim();
  if (kind === 'bool') return /^(1|true|yes|on)$/i.test(v) ? '1' : '';
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : '';
};

const fromAdmin = (kind, v) => {
  if (kind === 'bool') return typeof v === 'boolean' ? (v ? '1' : '') : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? (v > 0 ? String(v) : '') : undefined;
};

/**
 * Pure. [remote] is the `data` object of /public/seo-settings or null when
 * it could not be read; [vars] maps each env name to the repository
 * variable's text. Returns { values: { ENV: text }, sources: { ENV: 'admin'|'variable' } }.
 */
export function resolveSwitches({ remote, vars }) {
  const values = {};
  const sources = {};
  for (const s of SWITCHES) {
    const admin = remote && typeof remote === 'object' ? fromAdmin(s.kind, remote[s.field]) : undefined;
    if (admin !== undefined) {
      values[s.env] = admin;
      sources[s.env] = 'admin';
    } else {
      values[s.env] = fromVar(s.kind, vars?.[s.env]);
      sources[s.env] = 'variable';
    }
  }
  return { values, sources };
}

/** The admin's values, or null on any failure (network, status, shape). */
export async function fetchRemote(api, fetchImpl = fetch) {
  if (!api) return null;
  try {
    const res = await fetchImpl(`${api.replace(/\/+$/, '')}/public/seo-settings`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body && typeof body.data === 'object' ? body.data : null;
  } catch (e) {
    console.error(`seo switches: the admin settings could not be read (${e instanceof Error ? e.message : e}); repository variables are used`);
    return null;
  }
}

/** NAME=value lines for $GITHUB_ENV. Values hold only digits, so no quoting is needed. */
export const toEnvLines = (values) =>
  SWITCHES.map((s) => `${s.env}=${values[s.env]}`).join('\n') + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--api');
  const api = i >= 0 ? process.argv[i + 1] : '';
  const vars = Object.fromEntries(SWITCHES.map((s) => [s.env, process.env[`VAR_${s.env}`]]));
  const { values, sources } = resolveSwitches({ remote: await fetchRemote(api), vars });
  for (const s of SWITCHES) console.error(`seo switch ${s.env} = ${values[s.env] || 'off'} (${sources[s.env]})`);
  process.stdout.write(toEnvLines(values));
}
