#!/usr/bin/env node
// Б2 (25.11): canary vs control, the method of the Google SRE Workbook ch. 16
// "Canarying Releases": judge the canary against a CONTROL population that
// runs the old release at the same time, not against a fixed fleet-wide
// threshold (one bad canary task among N old ones disappears in the average).
//
// Input (stdin): the API's minute lines `{"metric":"slo","release":…,
// "httpReq":…,"http5xx":…}` (apps/api/src/common/ops/slo-metrics.service.ts),
// one JSON object per line, as `aws logs filter-log-events` returns them.
//
//   node canary-compare.mjs <new release tag> [minRequests] [floor] [factor]
//
// Fails (exit 1) when both sides have >= minRequests requests and
//   canary 5xx share > factor x control 5xx share + floor
// (the same rule as the CloudWatch alarm <env>-api-canary-vs-control).
// Too little traffic on either side = no verdict (exit 0, says so).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function tally(lines, tag) {
  const side = { canary: { req: 0, err: 0 }, control: { req: 0, err: 0 } };
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line.startsWith('{')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.metric !== 'slo' || typeof o.httpReq !== 'number') continue;
    const s = o.release === tag ? side.canary : side.control;
    s.req += o.httpReq;
    s.err += typeof o.http5xx === 'number' ? o.http5xx : 0;
  }
  return side;
}

export function judge(side, { minRequests = 50, floor = 0.005, factor = 2 } = {}) {
  const { canary, control } = side;
  if (canary.req < minRequests || control.req < minRequests) {
    return { verdict: 'unknown', reason: `too little traffic to compare (canary ${canary.req}, control ${control.req} requests; need ${minRequests} each)` };
  }
  const c = canary.err / canary.req;
  const k = control.err / control.req;
  const pct = (x) => `${(100 * x).toFixed(2)} %`;
  const text = `canary 5xx ${pct(c)} (${canary.err}/${canary.req}) vs control ${pct(k)} (${control.err}/${control.req})`;
  if (c > factor * k + floor) return { verdict: 'fail', reason: `${text}: above ${factor}x control + ${pct(floor)}` };
  return { verdict: 'pass', reason: text };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tag, min, floor, factor] = process.argv.slice(2);
  if (!tag) {
    console.error('usage: canary-compare.mjs <tag> [minRequests] [floor] [factor] < lines');
    process.exit(2);
  }
  // `--query 'events[].message' --output json` gives a JSON array of lines.
  const input = readFileSync(0, 'utf8');
  const lines = input.trimStart().startsWith('[') ? JSON.parse(input).flat() : input.split('\n');
  const r = judge(tally(lines, tag), {
    minRequests: min ? Number(min) : undefined,
    floor: floor ? Number(floor) : undefined,
    factor: factor ? Number(factor) : undefined,
  });
  console.log(`canary vs control: ${r.verdict}: ${r.reason}`);
  process.exit(r.verdict === 'fail' ? 1 : 0);
}
