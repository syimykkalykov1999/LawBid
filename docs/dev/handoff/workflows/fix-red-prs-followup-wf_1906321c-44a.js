export const meta = {
  name: 'fix-red-prs-followup',
  description: 'Correct the four fixes the skeptic refuted (373 lost edit, 411 stale doc, 389 dead import, 369 live counts) and re-verify',
  phases: [
    { title: 'Fix', detail: 'two sequential lanes, one worktree per PR' },
    { title: 'Verify', detail: 'a skeptic reviews each pushed diff' },
  ],
}
const FIX = { type: 'object', properties: {
  pr: { type: 'number' }, pushed: { type: 'boolean' }, commit: { type: 'string' },
  what_changed: { type: 'string' }, tests_run: { type: 'string' }, blocker: { type: 'string' },
}, required: ['pr', 'pushed', 'commit', 'what_changed', 'tests_run', 'blocker'] }
const VERDICT = { type: 'object', properties: {
  pr: { type: 'number' }, ok: { type: 'boolean' }, problems: { type: 'string' },
}, required: ['pr', 'ok', 'problems'] }
const RULES = `Rules (strict): the PR branch name is already checked out in another worktree, so: cd /Users/sima/Desktop/LawBid && git fetch origin <branch> && git worktree add .claude/worktrees/fix-<pr> -b fix-<pr>-tmp origin/<branch>; work there; push with git push origin HEAD:<branch>. Never touch other worktrees or main. Copy apps/api/.env from /Users/sima/Desktop/LawBid/apps/api/.env if missing; node_modules via scripts/dev/overlay-nm.sh if present, else symlink the root node_modules — never npm ci. Before any test run memory_pressure; if free RAM < 40 % wait (until-loop, 30 s steps, max 10 min); free disk is ~9 GB, so delete apps/mobile/build and .dart_tool before leaving. No Flutter iOS/Android builds, no Docker, no --no-verify, no --force, no UI/look changes, the smallest correct diff. Commit message 'fix(ci): <what>' + blank line + 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'. After pushing: cd /Users/sima/Desktop/LawBid && git worktree remove .claude/worktrees/fix-<pr> (plain remove; if it refuses because of untracked build files, delete those files first) && git branch -D fix-<pr>-tmp. If truly blocked, report the blocker instead of improvising.`
phase('Fix')
const fixOne = (p) => agent(
`Fix PR #${p.pr} (branch ${p.br}) of the LawBid monorepo.
Required fix: ${p.fix}
${RULES}
Return the structured result.`,
  { label: `fix:#${p.pr}`, phase: 'Fix', schema: FIX, effort: 'high' })
const lanes = await parallel(args.lanes.map((lane, li) => async () => {
  const out = []
  for (const p of lane) { const r = await fixOne(p); out.push(r || { pr: p.pr, pushed: false, commit: '', what_changed: '', tests_run: '', blocker: 'agent died' }); log(`lane ${li + 1}: #${p.pr} ${r && r.pushed ? 'pushed' : 'NOT pushed'}`) }
  return out
}))
const fixes = lanes.filter(Boolean).flat()
phase('Verify')
const verdicts = await pipeline(fixes.filter(f => f.pushed), (f) => agent(
`Skeptic review (read-only, no edits, no tests): PR #${f.pr}. A fixer pushed commit ${f.commit} claiming: "${f.what_changed}"; tests run: "${f.tests_run}". In /Users/sima/Desktop/LawBid/.claude/worktrees/resume-from-checkpoint-bae53d run git fetch origin and inspect \`git show ${f.commit}\` and the branch tip. Try to REFUTE that this is the minimal correct fix that respects the owner's rules (admin numbers never from live heavy queries; no UI/look changes; no weakened guards/baselines). Default ok=false if uncertain; list concrete problems.`,
  { label: `verify:#${f.pr}`, phase: 'Verify', schema: VERDICT, effort: 'high' }))
return { fixes, verdicts: verdicts.filter(Boolean) }