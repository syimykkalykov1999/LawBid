export const meta = {
  name: 'fix-red-prs-batch',
  description: 'Apply the diagnosed one-line fixes to 10 red PRs, two lanes at a time, verify each diff adversarially',
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
const RULES = `Rules (strict): work ONLY in a fresh worktree: cd /Users/sima/Desktop/LawBid && git fetch origin <branch> && git worktree add .claude/worktrees/fix-<pr> origin/<branch> -b fix-<pr>-tmp, then inside it: git checkout -B <branch> origin/<branch>. Never touch other worktrees or main. Copy apps/api/.env from /Users/sima/Desktop/LawBid/apps/api/.env if the worktree lacks it; node_modules: run scripts/dev/overlay-nm.sh if present, else npm ci is NOT allowed (RAM) — use the root node_modules via symlink. Before any test or build run memory_pressure; if free RAM < 40 % wait (until-loop, 30 s steps, max 10 min). No Flutter iOS builds, no Docker, no --no-verify, no --force, no UI/look changes, no unrelated refactors — the smallest diff that makes the named test pass. Commit message: 'fix(ci): <what>' + a blank line + 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'. Push with git push origin <branch>. After pushing: cd /Users/sima/Desktop/LawBid && git worktree remove --force .claude/worktrees/fix-<pr>. If something truly blocks you, stop and report the blocker instead of improvising.`
phase('Fix')
const fixOne = (p) => agent(
`Fix PR #${p.pr} (branch ${p.br}) of the LawBid monorepo so its failing CI check passes.
Diagnosis and required fix: ${p.fix}
${RULES}
Return the structured result.`,
  { label: `fix:#${p.pr}`, phase: 'Fix', schema: FIX, effort: 'medium' })
const lanes = await parallel(args.lanes.map((lane, li) => async () => {
  const out = []
  for (const p of lane) { const r = await fixOne(p); out.push(r || { pr: p.pr, pushed: false, commit: '', what_changed: '', tests_run: '', blocker: 'agent died' }); log(`lane ${li + 1}: #${p.pr} ${r && r.pushed ? 'pushed' : 'NOT pushed'}`) }
  return out
}))
const fixes = lanes.filter(Boolean).flat()
phase('Verify')
const verdicts = await pipeline(fixes.filter(f => f.pushed), (f) => agent(
`Skeptic review (read-only, no edits, no tests): PR #${f.pr}. A fixer pushed commit ${f.commit} claiming: "${f.what_changed}"; tests run: "${f.tests_run}". In /Users/sima/Desktop/LawBid/.claude/worktrees/resume-from-checkpoint-bae53d run git fetch origin and inspect \`git show ${f.commit}\`. Try to REFUTE that this is the minimal correct fix: does it change behaviour beyond the failing test, weaken a guard/test instead of fixing the cause, change UI/look, touch unrelated files, or leave the named failing test still failing by reading? Default ok=false if uncertain; list concrete problems.`,
  { label: `verify:#${f.pr}`, phase: 'Verify', schema: VERDICT, effort: 'high' }))
return { fixes, verdicts: verdicts.filter(Boolean) }