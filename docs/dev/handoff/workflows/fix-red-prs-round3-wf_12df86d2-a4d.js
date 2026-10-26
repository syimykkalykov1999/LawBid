export const meta = {
  name: 'fix-red-prs-round3',
  description: 'Third correction round: 369 drop unrequested guard, 411 doc line, 373 audit_log live queries → snapshot/bounded; re-verify',
  phases: [
    { title: 'Fix', detail: 'two sequential lanes, one worktree per PR' },
    { title: 'Verify', detail: 'a skeptic reviews each pushed diff' },
  ],
}
const FIX = { type: 'object', properties: { pr: { type: 'number' }, pushed: { type: 'boolean' }, commit: { type: 'string' }, what_changed: { type: 'string' }, tests_run: { type: 'string' }, blocker: { type: 'string' } }, required: ['pr', 'pushed', 'commit', 'what_changed', 'tests_run', 'blocker'] }
const VERDICT = { type: 'object', properties: { pr: { type: 'number' }, ok: { type: 'boolean' }, problems: { type: 'string' } }, required: ['pr', 'ok', 'problems'] }
const RULES = `Rules (strict): cd /Users/sima/Desktop/LawBid && git fetch origin <branch> && git worktree add .claude/worktrees/fix-<pr> -b fix-<pr>-tmp origin/<branch>; work there; push with git push origin HEAD:<branch>. Never touch other worktrees or main. Copy apps/api/.env from /Users/sima/Desktop/LawBid/apps/api/.env if missing; node_modules via scripts/dev/overlay-nm.sh if present (a private overlay copy of .prisma/@prisma + npx prisma generate inside the worktree when the branch's schema differs), never npm ci. Before any test run memory_pressure; if free RAM < 40 % wait (until-loop, 30 s steps, max 10 min). No Flutter/iOS/Android builds, no Docker, no --no-verify, no --force, no UI/look changes, smallest correct diff, never weaken a guard/baseline. Commit message 'fix(ci): <what>' + blank line + 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'. After pushing: remove the worktree (plain git worktree remove; delete untracked build files first if it refuses) and the tmp branch. If truly blocked, report the blocker.`
phase('Fix')
const fixOne = (p) => agent(`Fix PR #${p.pr} (branch ${p.br}) of the LawBid monorepo.\nRequired fix: ${p.fix}\n${RULES}\nReturn the structured result.`, { label: `fix:#${p.pr}`, phase: 'Fix', schema: FIX, effort: 'high' })
const lanes = await parallel(args.lanes.map((lane, li) => async () => { const out = []; for (const p of lane) { const r = await fixOne(p); out.push(r || { pr: p.pr, pushed: false, commit: '', what_changed: '', tests_run: '', blocker: 'agent died' }); log(`lane ${li + 1}: #${p.pr} ${r && r.pushed ? 'pushed' : 'NOT pushed'}`) } return out }))
const fixes = lanes.filter(Boolean).flat()
phase('Verify')
const verdicts = await pipeline(fixes.filter(f => f.pushed), (f) => agent(`Skeptic review (read-only): PR #${f.pr}, commit ${f.commit}, claim: "${f.what_changed}", tests: "${f.tests_run}". In /Users/sima/Desktop/LawBid/.claude/worktrees/resume-from-checkpoint-bae53d run git fetch origin and inspect the commit and branch tip. REFUTE if: it weakens a guard/baseline, changes UI/look or user-visible behaviour beyond the stated fix, adds live heavy admin queries, or the named failing test would still fail by reading. Judge the COMMIT (not pre-existing merge conflicts). Default ok=false if uncertain.`, { label: `verify:#${f.pr}`, phase: 'Verify', schema: VERDICT, effort: 'high' }))
return { fixes, verdicts: verdicts.filter(Boolean) }