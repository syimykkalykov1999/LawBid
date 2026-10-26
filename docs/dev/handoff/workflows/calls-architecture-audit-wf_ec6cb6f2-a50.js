export const meta = {
  name: 'calls-architecture-audit',
  description: 'Research-first audit of the whole calls system (Cloudflare primary, own failover, CallKit, WhatsApp-parity UI, admin keys) with adversarial verification of every finding',
  phases: [
    { title: 'Research', detail: 'fresh vendor docs and giants’ behaviour' },
    { title: 'Audit', detail: 'seven read-only dimensions over PR 414 (includes 415)' },
    { title: 'Verify', detail: 'two skeptics per finding' },
    { title: 'Synthesize', detail: 'ordered fix list + owner report' },
  ],
}
const FINDINGS = { type: 'object', properties: {
  dimension: { type: 'string' },
  summary: { type: 'string', description: 'what works and what does not, 3-6 sentences' },
  findings: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
    title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
    evidence: { type: 'string', description: 'quoted code or doc lines proving it' },
    expected: { type: 'string', description: 'what WhatsApp / Cloudflare docs / the owner rule requires' },
    fix: { type: 'string', description: 'concrete change, files, tests' },
  }, required: ['id', 'severity', 'title', 'file', 'line', 'evidence', 'expected', 'fix'] } },
}, required: ['dimension', 'summary', 'findings'] }
const RESEARCH = { type: 'object', properties: {
  notes: { type: 'string', description: 'facts with source URL and date, grouped by topic' },
}, required: ['notes'] }
const VERDICT = { type: 'object', properties: { id: { type: 'string' }, real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['id', 'real', 'reason'] }
const SYNTH = { type: 'object', properties: {
  works_now: { type: 'string', description: 'plain statement: what already works end to end' },
  keys_flow_ok: { type: 'boolean', description: 'true only if entering Cloudflare keys in the admin makes Cloudflare the live path without restart and own servers go idle' },
  failover_ok: { type: 'boolean', description: 'true only if mid-call failover to own servers and switch-back are implemented and tested' },
  fix_order: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, title: { type: 'string' }, fix: { type: 'string' }, files: { type: 'string' } }, required: ['id', 'severity', 'title', 'fix', 'files'] } },
  report_ru: { type: 'string', description: 'plain Russian for the owner, max 12 lines, no code' },
}, required: ['works_now', 'keys_flow_ok', 'failover_ok', 'fix_order', 'report_ru'] }
const W = args.worktree, BR = args.branch
const CTX = `Code under review: branch ${BR} (PR #${args.pr}, which contains PR #${args.base_pr}) checked out read-only at ${W} (run \`git -C ${W} fetch origin ${BR} && git -C ${W} log -1 origin/${BR}\` and read files from origin/${BR} with \`git -C ${W} show origin/${BR}:<path>\` or inspect the worktree after \`git -C ${W} checkout -q origin/${BR}\` is NOT allowed — the worktree belongs to another agent; use \`git show\` and \`git grep\` against origin/${BR} only). Key areas: apps/api/src/modules/calls/** (cloudflare-transport.ts, transport selection, signalling gateway, TURN/SFU credential issuing, solo-end, failover), apps/api/src/modules/admin-config/** and app-settings (calls.* keys, calls.transport Выкл/Вкл/Авто), apps/admin «Связь для звонков» card, apps/mobile/lib/features/calls/** (call screens, state machine, CallKit/ConnectionService, PiP, grid/focus), docs/dev/calls-rework/CALL_FLOW.md, docs/dev/calls-rework/REFERENCE.md, infra/ (coturn, LiveKit). Do NOT edit anything, do NOT run builds; unit tests may be read, not run. Cite file:line for every finding.`
phase('Research')
const research = await parallel([
  () => agent(`Research (web, 2025-2026 sources, cite URL + date) and return notes: Cloudflare Realtime (formerly Calls) — SFU API (apps, sessions, tracks, renegotiation, token/secret usage, limits), Cloudflare TURN service (key id/API token, credential generation endpoint, TTL, STUN/TURN hostnames, ports, TLS), current pricing/free tier (egress GB), status/health endpoints, recommended failover patterns (ICE restart vs new PeerConnection, when to switch back), and known gotchas (mobile networks, UDP blocked → TCP/TLS 443). Also: how to detect "Cloudflare is down" from a server (probe) within seconds without false positives.`, { label: 'research:cloudflare', phase: 'Research', schema: RESEARCH, effort: 'high' }),
  () => agent(`Research (web, cite URL + date) how WhatsApp, Telegram, FaceTime and Zoom behave in calls, as a spec: 1:1 end when peer leaves (instant), group alone behaviour, reconnection UX ("Reconnecting…" overlay timing), ICE restart handling, controls auto-hide timing, grid layouts by participant count, speaker highlight, PiP drag/snap, minimised call bar, incoming call on locked screen (iOS CallKit + PushKit rules: must report every VoIP push to CallKit, else app killed; Android full-screen intent + CallStyle notification, Android 14 restrictions), audio routing (speaker/earpiece/bluetooth), haptics. Also Flutter specifics: flutter_webrtc renegotiation/ICE restart APIs, flutter_callkit_incoming vs callkeep patterns, avoiding double CallKit listeners.`, { label: 'research:giants', phase: 'Research', schema: RESEARCH, effort: 'high' }),
])
const notes = research.filter(Boolean).map(r => r.notes).join('\n\n')
phase('Audit')
const DIMS = [
  { key: 'transport-selection', prompt: `Transport selection and the admin keys flow. Trace exactly: admin enters Cloudflare keys (which settings keys? app id/secret, TURN key id/token) → where stored → how the API reads them at call-setup time (per call or cached? boot-only?) → how calls.transport (Выкл/Вкл/Авто) decides Cloudflare vs own coturn/LiveKit → how ICE servers / SFU session are handed to the app. Confirm or refute: "as soon as the owner saves the keys in the admin, the next call uses Cloudflare with no restart, and own servers are not used". Check cache TTLs, settings invalidation, status dots, «Проверить» probe, and that nothing is ON by default without keys.` },
  { key: 'failover', prompt: `Mid-call failover and switch-back. Find the health probe (what, how often, thresholds, false-positive protection, hysteresis), the server-side decision to fail over, how the app is told, how the PeerConnection migrates (ICE restart with new ICE servers vs new PC, track re-attachment, SFU session re-create), what the user sees (must be nothing or a brief "Reconnecting"), and switch-back when Cloudflare recovers (does an ongoing call switch back, or only new calls? flapping protection). Also the reverse: own servers down while Cloudflare is primary. Compare with the research notes.` },
  { key: 'cloudflare-api', prompt: `Cloudflare integration correctness against the docs in the research notes: endpoints, auth headers, request/response shapes, TURN credential TTL, token lifetime vs call length, renegotiation, error handling and retries, secrets never logged, rate limits, cost guards (egress ceiling, admin ceiling, cost registry row), Redis keys/TTLs, cluster-safe commands.` },
  { key: 'lifecycle', prompt: `Call lifecycle and signalling: ring (push with avatar; VoIP push → CallKit report on iOS always; Android full-screen), answer/decline, busy, missed, hang-up (1:1 ends instantly when the peer leaves — owner decision; group auto-end after 3 s alone), timeouts, reconnection after network loss, double-event protection (architecture test forbids a second CallKit subscriber), idempotent end, call records/duration, and the "call does not end" bug being truly closed (teardown continues past throwing track.stop()).` },
  { key: 'ui-parity', prompt: `Flutter call UI WhatsApp parity and smoothness: full-screen video, name/timer top with shadow, bottom sheet controls, tap-to-toggle with 4 s auto-hide (video only), grid gaps/radius, last-row stretch for odd counts, speaker ring, tile→focus→strip→grid transitions at 300 ms without video restart (check that renderers are reused, keys stable, no rebuild of the whole tree per frame), PiP drag/snap, double-tap swap, minimised green bar, audio screens, blurred avatar when camera off, no flicker of texts/buttons, haptics, reduced-motion. Check performance pitfalls (setState on whole screen, missing RepaintBoundary, listeners not disposed).` },
  { key: 'avatars-notifications', prompt: `Avatars and call-related notifications: ring push carries caller photo (iOS Communication Notifications, Android CallStyle person with icon), avatar fallback when preview missing (interaction with PR #417's stable_network_image — check branch ${BR} for conflicts or duplicate providers), missed-call notification, avatars inside call tiles when camera off. Flag duplicates (two image providers, two push builders) and dead code.` },
  { key: 'tests-ci', prompt: `Tests and CI coverage for all of the above: which unit/widget/e2e tests exist, which critical paths are untested (failover state machine, keys hot-reload, 1:1 instant end, group 3 s, CallKit single subscriber, TURN credential TTL), flaky risks, and whether Mobile CI builds iOS/Android for this branch. Propose the minimal test set that proves the owner's scenario end to end without a phone.` },
]
const audits = await pipeline(DIMS, (d) => agent(`${CTX}\n\nDimension: ${d.key}. ${d.prompt}\n\nResearch notes to compare against:\n${notes.slice(0, 12000)}\n\nReturn findings with severity (P0 = calls break or owner scenario fails, P1 = visible defect or rule violation, P2 = polish). Be concrete and honest: if something is correct, say so in summary.`, { label: `audit:${d.key}`, phase: 'Audit', schema: FINDINGS, effort: 'high' }))
const all = audits.filter(Boolean)
const flat = all.flatMap(a => a.findings.map(f => ({ ...f, dimension: a.dimension })))
log(`${flat.length} raw findings from ${all.length} dimensions`)
phase('Verify')
const verified = await pipeline(flat, (f) => parallel(['correctness', 'does-the-owner-scenario-really-fail'].map(lens => () => agent(
  `${CTX}\nSkeptic lens: ${lens}. Try to REFUTE this finding by reading the code on origin/${BR}: ${JSON.stringify(f)}. Default real=false if uncertain or if the evidence does not match the file. Explain briefly.`,
  { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT, effort: 'medium' }))).then(vs => ({ ...f, real: vs.filter(Boolean).filter(v => v.real).length >= 1 && !(vs.filter(Boolean).length === 2 && vs.filter(Boolean).every(v => !v.real)), verdicts: vs.filter(Boolean) })))
const confirmed = verified.filter(Boolean).filter(f => f.real)
log(`${confirmed.length} confirmed of ${flat.length}`)
phase('Synthesize')
const synth = await agent(`Synthesize for the owner (he is not a programmer; Russian, plain) and for the fixers. Dimension summaries:\n${JSON.stringify(all.map(a => ({ d: a.dimension, s: a.summary })), null, 1)}\n\nConfirmed findings:\n${JSON.stringify(confirmed.map(f => ({ id: f.id, sev: f.severity, title: f.title, file: f.file, line: f.line, fix: f.fix, dimension: f.dimension })), null, 1)}\n\nDecide keys_flow_ok and failover_ok strictly from the evidence. Order fix_order by severity then by how much each unblocks the owner's scenario. report_ru max 12 lines.`, { label: 'synthesize', phase: 'Synthesize', schema: SYNTH, effort: 'high' })
return { research: notes.slice(0, 20000), summaries: all.map(a => ({ d: a.dimension, s: a.summary })), confirmed, synth }