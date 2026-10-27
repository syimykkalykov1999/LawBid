// Resets the CloudFront cache for the paths in a file (one per line), with
// the wildcard cap and the wait-or-skip rule of lib/invalidate.mjs.
//   node scripts/seo/invalidate.mjs --distribution ID --paths-file f.txt
//        [--max-wildcards 10] [--max-paths 30]
// --max-wildcards 0 = exact paths only (the incremental publish).
// Exit 0 also when the reset was skipped (busy CloudFront): the pages are
// live and the cache expires within an hour. Any other error fails.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MAX_PATHS, MAX_WILDCARDS, capPaths, invalidateWithBackoff } from './lib/invalidate.mjs';

const run = promisify(execFile);
const aws = async (args) => {
  try {
    return (await run('aws', args, { maxBuffer: 64 * 1024 * 1024 })).stdout;
  } catch (e) {
    throw new Error(`${e.stderr || ''}${e.message}`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const distribution = arg('distribution', '');
  const num = (n, d) => (Number.isFinite(Number.parseInt(arg(n, ''), 10)) ? Number.parseInt(arg(n, ''), 10) : d);
  if (!distribution) {
    console.error('--distribution is required');
    process.exit(2);
  }
  const wanted = (await readFile(arg('paths-file', ''), 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean);
  const { paths, dropped } = capPaths(wanted, { maxWildcards: num('max-wildcards', MAX_WILDCARDS), maxPaths: num('max-paths', MAX_PATHS) });
  if (dropped) console.log(`${dropped} path(s) left to the cache lifetime (cap of ${num('max-wildcards', MAX_WILDCARDS)} wildcards / ${num('max-paths', MAX_PATHS)} paths)`);
  const r = await invalidateWithBackoff({
    paths,
    log: (m) => console.log(m),
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    inProgress: async () => {
      const out = JSON.parse(await aws(['cloudfront', 'list-invalidations', '--distribution-id', distribution, '--output', 'json']));
      return (out.InvalidationList?.Items ?? []).filter((i) => i.Status === 'InProgress').length;
    },
    create: async (p) => {
      await aws(['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', ...p]);
    },
  });
  if (r.status === 'skipped') {
    console.log(`::warning::CloudFront cache reset skipped after ${r.attempts} tries: too many resets in progress. The pages are published; the cache expires within an hour.`);
  } else {
    console.log(`cache reset: ${r.status}, ${paths.length} path(s)`);
  }
}
