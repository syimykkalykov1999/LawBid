# HELPER RULES (LawBid) — restored 2026-10-26 after /private/tmp was wiped; the single source for helper agents

## Machine safety (owner: 16 GB Mac must never freeze)
- Before EVERY heavy command: `memory_pressure | grep free`; below 40 % wait 60 s and retry; one heavy command at a time.
- Heavy commands ONLY through `bash /Users/sima/Desktop/LawBid/scripts/dev/heavy.sh -- <cmd>` (typecheck, lint, jest, prisma generate, contract regen, ERD, flutter, builds, git commit with hooks). Combine steps into ONE heavy.sh call (`bash -c 'a && b && c'`).
- Terraform ONLY as `bash <scratchpad>/tf-lock.sh -- terraform init -backend=false -input=false` then `… -- terraform validate`, one module at a time, never through heavy.sh, never `apply`, never IAM/CloudFront publish.
- No Docker beyond postgres/redis (already running). No npm ci / npm install in worktrees; node_modules is the shared install (`bash <scratchpad>/overlay-nm.sh <worktree>` creates a symlink overlay with a local Prisma client; then `npx prisma generate` via heavy.sh).
- Never `git stash` (shared stack). Never `--no-verify`, never `--force`. Never paste secrets (repo is public). Do not touch the SiMA Taxi project.
- Never delete anything needed (check untracked tfvars/.env/keys before any cleanup).

## Product rules
- No second-admin / four-eyes approvals anywhere (admin.dual_control false); one 2FA code only.
- App and admin LOOK is frozen: no layout/button/visual changes unless the owner asked for that exact change.
- payments_in_app stays locked off; no client→attorney payments; no ACH.
- Nothing billable or load-creating is ON at launch unless needed: every such thing gets a 3-state admin control Выкл/Вкл/Авто with a ceiling, Авто default, driven by a real signal; never "off forever". This includes hidden items (frequent crons, per-request metrics/logs, polling, invalidations, scheduled Lambdas, synthetics).
- Admin numbers come only from the nightly ADMIN STATS SNAPSHOT (never live heavy queries in admin code).
- Everything must really work: functional smoke, not only unit tests. No duplicates: grep for an existing job/setting/card/endpoint before adding one.

## Process
- Research first, everywhere it is built well (vendor docs, engineering blogs, OWASP/NIST, GitHub awesome lists), cite in the PR under "Research → choice → why". Prefer ready-made solutions. TDD. Explain for a non-programmer (Russian labels/guides).
- Migrations: folder name must sort after every migration on main and in open PRs (use 20261031xxxxxx+). New jobs/tables → jobs.runner.spec.ts counts + shard-manifest counts. Routes/DTO changes → `sh packages/api-contract/generate.sh` (heavy) and commit packages/api-contract; oasdiff additive-enum errors → add the exact line to packages/api-contract/oasdiff-err-ignore.txt. Module-boundaries baseline → regenerate (UPDATE_BOUNDARIES=1). ERD → `npm run db:erd`. Guides → every guide needs a category (Запуск · Деньги · Люди · Контент · Право · Система) and the standard sections incl. «## Как проверить».
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. PR body: what / verified / owner steps / risks / «Стоимость» (price at launch, at 1M users, switch, alarm, "нагрузка") / Research → choice → why; end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Do not wait for CI, do not merge (the merge train does). Never wait silently: if a queued job has not started in 15 minutes, message the foreman. Final report: 2-3 lines.
