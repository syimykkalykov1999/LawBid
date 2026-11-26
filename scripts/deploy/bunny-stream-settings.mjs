#!/usr/bin/env node
// Bunny Stream encoding settings as code (item 18 / M5 of
// docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md).
//
// Big platforms keep the media pipeline's encoding ladder in code and review it
// like code (Meta, AV1 for Reels, 21.02.2023:
// https://engineering.fb.com/2023/02/21/video-engineering/av1-codec-facebook-instagram-reels/).
// Ours lived only in the Bunny dashboard. The wanted values are in
// bunny-stream-settings.json (Bunny's own field names); this script:
//   check  READ-ONLY. GET https://api.bunny.net/videolibrary/{id} and compare.
//          exit 0 = same, 1 = drift (or Bunny unreadable), 2 = no key.
//          --soft: no key -> a notice and exit 0 (the deploy workflow uses it
//          until the owner adds the secrets).
//   apply  The owner's explicit command: shows the drift, and only with --yes
//          POSTs the wanted values to the same URL, then checks again.
// Keys come from the environment only, under the names the API already uses
// (apps/api/src/common/secrets/provider-registry.ts): BUNNY_LIBRARY_ID and
// BUNNY_ACCOUNT_API_KEY (the Core API takes the ACCOUNT key, not the library
// key). Bunny's answer carries the library's API keys: it is never printed,
// only the compared fields are.
//
// Rules of the ladder (validateDesired):
//   * H.264 (x264) stays in every codec list: old phones decode nothing else.
//   * vp9 / hevc / av1 exist only on Premium encoding (EncodingTier 1). Premium
//     is paid per minute, so tier 0 is declared until the owner says yes; the
//     AV1 copy for tier 1 is already declared and is checked once tier 1 is on.
//   * a rung at or under 480p (fast start on a weak network, the player starts
//     from the lowest one) and, with MP4 fallback on, one at or under 720p (Bunny
//     writes MP4 fallbacks only up to 720p; the app plays them for short clips,
//     apps/api/src/modules/videos/videos.service.ts pickMp4Fallback).
// Field list and allowed values: Bunny API reference, Get / Update Video Library
// (https://bunny.net/docs/reference/videolibrarypublic_index2,
// https://bunny.net/docs/reference/videolibrarypublic_update, read 25.11.2026).
// Own code: no ready-made drift checker for the Bunny Stream API exists; the
// official Terraform provider (BunnyWay/bunnynet, bunnynet_stream_library) would
// need the library imported into owner-run Terraform state — noted as the next
// step, not done here.
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORE_API = 'https://api.bunny.net';
export const RESOLUTIONS = ['240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'];
export const CODECS = ['x264', 'vp9', 'hevc', 'av1'];
const BOOLEAN_FIELDS = ['EnableMP4Fallback', 'JitEncodingEnabled', 'HasWatermark'];

const height = (r) => Number.parseInt(r, 10);

/** Errors of the declared file; empty = valid. */
export function validateDesired(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return ['the file is not a JSON object'];
  if (d.encodingTier !== 0 && d.encodingTier !== 1) {
    errors.push('encodingTier must be 0 (Free) or 1 (Premium)');
  }
  const s = d.settings;
  if (!s || typeof s !== 'object') return [...errors, 'settings is missing'];
  const res = s.EnabledResolutions;
  if (!Array.isArray(res) || res.length === 0) {
    errors.push('settings.EnabledResolutions must be a non-empty list');
  } else {
    for (const r of res) {
      if (!RESOLUTIONS.includes(r)) errors.push(`unknown resolution "${r}"`);
    }
    if (new Set(res).size !== res.length) errors.push('EnabledResolutions has a repeat');
    if (!res.some((r) => height(r) <= 480)) {
      errors.push('EnabledResolutions needs a rung at or under 480p (fast start)');
    }
    if (s.EnableMP4Fallback === true && !res.some((r) => height(r) <= 720)) {
      errors.push('MP4 fallback needs a rung at or under 720p (Bunny writes MP4 only up to 720p)');
    }
  }
  for (const f of BOOLEAN_FIELDS) {
    if (typeof s[f] !== 'boolean') errors.push(`settings.${f} must be true or false`);
  }
  if (s.JitEncodingEnabled === true && d.encodingTier !== 1) {
    errors.push('JitEncodingEnabled works only on Premium encoding (encodingTier 1)');
  }
  const byTier = d.outputCodecsByTier;
  if (!byTier || typeof byTier !== 'object') {
    errors.push('outputCodecsByTier is missing');
  } else {
    for (const tier of ['0', '1']) {
      const list = byTier[tier];
      if (!Array.isArray(list) || list.length === 0) {
        errors.push(`outputCodecsByTier.${tier} must be a non-empty list`);
        continue;
      }
      for (const c of list) {
        if (!CODECS.includes(c)) errors.push(`unknown codec "${c}" (tier ${tier})`);
      }
      if (!list.includes('x264')) {
        errors.push(`outputCodecsByTier.${tier} must keep x264 (H.264 for old phones)`);
      }
    }
    if (Array.isArray(byTier['0']) && byTier['0'].some((c) => c !== 'x264')) {
      errors.push('Free encoding (tier 0) has only x264');
    }
  }
  for (const f of d.readOnly ?? []) {
    if (!(f in s)) errors.push(`readOnly field ${f} is not in settings`);
  }
  // D10 (SECOND_PASS_2026-11-26): the backup block. keepOriginals = false means
  // "no opinion" (the field is not compared), true = Bunny must keep originals.
  if (d.backup !== undefined) {
    if (!d.backup || typeof d.backup.keepOriginals !== 'boolean') {
      errors.push('backup.keepOriginals must be true or false');
    }
  }
  return errors;
}

/** "720p, 240p" / ["720p","240p"] -> "240p,720p" (order and case do not matter). */
export function normList(v) {
  if (v == null) return null;
  const parts = (Array.isArray(v) ? v : String(v).split(','))
    .map((x) => String(x).trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parts)]
    .sort((a, b) => (height(a) || 0) - (height(b) || 0) || a.localeCompare(b))
    .join(',');
}

/** The wanted values of the compared fields, normalised. */
export function expected(d) {
  return {
    EncodingTier: d.encodingTier,
    OutputCodecs: normList(d.outputCodecsByTier[String(d.encodingTier)]),
    EnabledResolutions: normList(d.settings.EnabledResolutions),
    EnableMP4Fallback: d.settings.EnableMP4Fallback,
    JitEncodingEnabled: d.settings.JitEncodingEnabled,
    HasWatermark: d.settings.HasWatermark,
    // Bunny keeps the uploaded original next to the encoded copies (VideoLibrary
    // KeepOriginalFiles): a video can be re-encoded or restored from it.
    ...(d.backup?.keepOriginals === true ? { KeepOriginalFiles: true } : {}),
  };
}

const LIST_FIELDS = new Set(['OutputCodecs', 'EnabledResolutions']);

/** Differences between the wanted file and Bunny's answer: [{field, want, have}]. */
export function compare(d, live) {
  const want = expected(d);
  const drift = [];
  for (const [field, w] of Object.entries(want)) {
    const raw = live?.[field];
    const have =
      raw === undefined ? '(missing)' : LIST_FIELDS.has(field) ? normList(raw) : raw;
    if (have !== w) drift.push({ field, want: w, have });
  }
  return drift;
}

/** Body of POST /videolibrary/{id}: every compared field Bunny lets us set. */
export function updateBody(d) {
  const ro = new Set(d.readOnly ?? []);
  const want = expected(d);
  const body = {};
  for (const [field, v] of Object.entries(want)) {
    if (!ro.has(field)) body[field] = v;
  }
  return body;
}

export function loadDesired(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Markdown table for the job summary (only compared fields, never keys). */
export function report(drift, d) {
  if (drift.length === 0) {
    return '✅ Bunny Stream library settings match scripts/deploy/bunny-stream-settings.json\n';
  }
  const ro = new Set(d.readOnly ?? []);
  const rows = drift.map(
    (x) =>
      `| ${x.field} | ${JSON.stringify(x.want)} | ${JSON.stringify(x.have)} | ${ro.has(x.field) ? 'Bunny dashboard by hand' : '`apply --yes`'} |`,
  );
  return [
    '❌ Bunny Stream library settings differ from scripts/deploy/bunny-stream-settings.json',
    '',
    '| Field | In code | In Bunny | Fixed by |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

async function bunny(method, libraryId, key, body, fetchFn) {
  const res = await fetchFn(`${CORE_API}/videolibrary/${encodeURIComponent(libraryId)}`, {
    method,
    headers: {
      AccessKey: key,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Bunny ${method} /videolibrary answered HTTP ${res.status}`);
  return method === 'GET' ? res.json() : null;
}

export async function run(argv, env = process.env, fetchFn = fetch, out = console) {
  const [cmd, ...flags] = argv;
  const soft = flags.includes('--soft');
  const yes = flags.includes('--yes');
  const fileFlag = flags.find((f) => f.startsWith('--file='));
  const file = fileFlag
    ? fileFlag.slice('--file='.length)
    : join(dirname(fileURLToPath(import.meta.url)), 'bunny-stream-settings.json');
  const summary = (text) => {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
  };
  if (cmd !== 'check' && cmd !== 'apply') {
    out.error('usage: bunny-stream-settings.mjs check [--soft] | apply [--yes] [--file=path]');
    return 64;
  }
  const d = loadDesired(file);
  const errors = validateDesired(d);
  if (errors.length) {
    out.error(`bunny-stream-settings.json is invalid:\n- ${errors.join('\n- ')}`);
    return 1;
  }
  const libraryId = env.BUNNY_LIBRARY_ID?.trim();
  const key = env.BUNNY_ACCOUNT_API_KEY?.trim();
  if (!libraryId || !key) {
    const msg =
      'ℹ️ Bunny Stream settings not checked: BUNNY_LIBRARY_ID / BUNNY_ACCOUNT_API_KEY are not set (report only).';
    out.log(msg);
    summary(msg);
    return soft && cmd === 'check' ? 0 : 2;
  }
  let live;
  try {
    live = await bunny('GET', libraryId, key, null, fetchFn);
  } catch (e) {
    const msg = `❌ Bunny Stream settings could not be read: ${e.message}`;
    out.error(msg);
    summary(msg);
    return 1;
  }
  const drift = compare(d, live);
  // Read-only facts for the backup runbook: Bunny sets storage replication
  // only in its dashboard (not in the update API), so it is shown, not compared.
  const regions = Array.isArray(live?.ReplicationRegions) ? live.ReplicationRegions : [];
  const backupLine = `Bunny storage replication regions: ${regions.length ? regions.join(', ') : 'none'}; keep originals: ${live?.KeepOriginalFiles === true ? 'yes' : 'no'}`;
  out.log(backupLine);
  summary(backupLine);
  const text = report(drift, d);
  out.log(text);
  summary(text);
  if (cmd === 'check' || drift.length === 0) return drift.length ? 1 : 0;

  // apply: only on the owner's explicit --yes.
  if (!yes) {
    out.log('Nothing written. Run again with --yes to write the values above to Bunny.');
    return 1;
  }
  await bunny('POST', libraryId, key, updateBody(d), fetchFn);
  const after = compare(d, await bunny('GET', libraryId, key, null, fetchFn));
  const left = report(after, d);
  out.log(left);
  summary(left);
  return after.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await run(process.argv.slice(2));
}
