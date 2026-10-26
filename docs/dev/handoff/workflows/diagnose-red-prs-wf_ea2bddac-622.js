export const meta = {
  name: 'diagnose-red-prs',
  description: 'Read the failing CI logs of every red/conflicting open PR and cluster the root causes',
  phases: [
    { title: 'Diagnose', detail: 'one agent per PR reads its failing job logs' },
    { title: 'Cluster', detail: 'group by root cause, list common fixes' },
  ],
}
const DIAG = {
  type: 'object',
  properties: {
    pr: { type: 'number' },
    conflicting: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'object', properties: {
      check: { type: 'string' },
      test_or_error: { type: 'string', description: 'exact failing test name(s) or compiler/lint error, max 300 chars' },
      cause: { type: 'string', enum: ['own-bug', 'test-wrong', 'flaky-timing', 'main-drift', 'runner-cancelled', 'unknown'] },
      explanation: { type: 'string', description: 'why, 1-2 sentences, with the evidence line' },
    }, required: ['check', 'test_or_error', 'cause', 'explanation'] } },
    conflict_files: { type: 'array', items: { type: 'string' } },
    summary_ru: { type: 'string', description: 'one plain Russian sentence for the owner: what is wrong with this PR' },
  },
  required: ['pr', 'conflicting', 'failures', 'conflict_files', 'summary_ru'],
}
const CLUSTER = {
  type: 'object',
  properties: {
    clusters: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, prs: { type: 'array', items: { type: 'number' } },
      root_cause: { type: 'string' }, fix: { type: 'string', description: 'concrete fix, where (file/test), who should do it: train / per-PR fixer / fix-PR-to-main' },
    }, required: ['title', 'prs', 'root_cause', 'fix'] } },
    report_ru: { type: 'string', description: 'short plain-Russian report for the owner (no code), max 12 lines' },
  },
  required: ['clusters', 'report_ru'],
}
phase('Diagnose')
const repo = 'syimykkalykov1999/LawBid'
const results = await pipeline(args, (p, _, i) => agent(
`Diagnose why PR #${p.n} (branch ${p.br}) of GitHub repo ${repo} is not mergeable. Work read-only in /Users/sima/Desktop/LawBid/.claude/worktrees/resume-from-checkpoint-bae53d using the gh CLI; do NOT check out branches, do NOT edit files, do NOT run tests or builds (the Mac is under load).
Known: mergeable=${p.m}; checks with FAILURE conclusion: ${JSON.stringify(p.red)} (CANCELLED checks are GitHub-runner cancellations, ignore them unless nothing else is red).
Steps: 1) \`gh pr view ${p.n} --json statusCheckRollup --jq '.statusCheckRollup[]|select(.conclusion=="FAILURE")|"\\(.name) \\(.detailsUrl)"'\` → for each failing job take the job id from the URL and run \`gh run view --job <id> --log-failed 2>/dev/null | sed 's/\\x1b\\[[0-9;]*m//g' | grep -E "FAIL |● |error TS|Error:|❌|Expected|Received|Tests:|npm error|exit code"\` (also try \`gh api repos/${repo}/actions/jobs/<id>/logs\` if empty) and extract the exact failing test / error line. 2) If a failure is a jest e2e that passes in other PRs (counters, shares, followers, likeCount timing) classify flaky-timing only with evidence; if the failing test belongs to the PR's own feature classify own-bug; if the PR does not touch the failing area and main changed it recently (\`git log origin/main --oneline -5 -- <path>\`) classify main-drift. 3) If mergeable=CONFLICTING run \`gh pr view ${p.n} --json files --jq '.files[].path'\` and \`git fetch origin ${p.br} && git merge-tree $(git merge-base origin/main origin/${p.br}) origin/main origin/${p.br} | grep -E "^<<<<<<<|changed in both" -A1 | head -20\` to list conflicting files. Return the structured result only.`,
  { label: `diag:#${p.n}`, phase: 'Diagnose', schema: DIAG, model: 'sonnet', effort: 'medium' }))
const ok = results.filter(Boolean)
log(`diagnosed ${ok.length}/${args.length} PRs`)
phase('Cluster')
const cluster = await agent(
`Here are CI diagnoses for ${ok.length} open PRs of a NestJS/Flutter monorepo (merge train is landing them one by one; GitHub runners are saturated, API CI job takes 40-75 min). Cluster them by root cause. For every cluster give the concrete fix and who does it: 'train' (re-merge main / rerun), 'per-PR fixer' (bug in the PR's own code/tests), or 'fix-PR-to-main first' (a shared flaky test or shared helper that makes many PRs red). Order clusters by how many PRs they unblock. Then write report_ru: plain Russian for a non-programmer owner, max 12 lines, no code, honest about what is flaky vs real bugs vs GitHub queue.
DATA:
${JSON.stringify(ok, null, 1)}`,
  { label: 'cluster', phase: 'Cluster', schema: CLUSTER, effort: 'high' })
return { diagnoses: ok, cluster }