# HANDOFF — continue exactly here (written 2026-10-24 night by the coordinator)

Another Claude account may pick this up. Read ALL of this before doing anything.

## 1. Who and how
- **Owner:** SiMA (Syimyk Kalykov). He is not a programmer.
  - Always answer in Russian, in plain words, 2-4 short lines. No long tables or "books" unless he asks.
  - He gets angry at long texts, jargon, guesses, and at re-proposing things that are already done.
- **You are the foreman.** Delegate the work to sub-agents:
  - model `sonnet` (or `haiku` for mechanical work);
  - at most 2 heavy workers at once;
  - `isolation: worktree`.
  - Every brief says: research first with LIVE web search using 2025-2026 sources and citing dates, then design, then code. Never guess; copy proven open-source or managed tools where they exist.
- **The app's LOOK is FROZEN:** layout, buttons, colors, screens.
  - Change UI only when he asks for it, and then minimally. «чуть чуть» means about 20 px.
  - The held branch `claude/mine-menus-polish` (menu rewrites) is NOT to be merged without his OK.
- **Scaling rule:**
  - every component starts cheapest and grows or shrinks by itself;
  - its ceiling can be raised in the admin;
  - the move to bigger, split or cluster setups is ready now as a switch or button.
  - We never pay for empty capacity and never need code changes later.
- **Git:**
  - Push and self-merge PRs when CI is green: `gh ... -R syimykkalykov1999/LawBid`; there are two remotes.
  - Never use `--no-verify`.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - PR bodies end with the Claude Code line.
- **Prod Terraform apply is done ONLY by the owner, pressing Run on a saved plan you prepared.** The classifier blocks you from applying to prod and from IAM changes. Give him one bash block.
- **AWS credentials:** `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION; eval "$(aws configure export-credentials --format env)"`. If the session expired, tell him to run `aws login`.
- **Hooks:**
  - The Fact-Forcing Gate wants facts before the first Bash command and before rm or destructive commands: request, what the command does, rollback, and his words quoted. Then retry the SAME command.
  - With `rm` on variables, use `${x:?}`.
- **Mac hygiene:** when free space is below 15 GB, delete build outputs; after installing builds on the phones, delete apps/mobile/build. A battery watch runs; at 15 % send him a PushNotification.

## 2. Where things are
- **Prod tfvars (git-ignored):** `.claude/worktrees/tf-plan/infra/envs/prod/terraform.tfvars`. A backup is in Secrets Manager `lawbid-prod/terraform-tfvars`; re-upload it after every edit.
  - Settings: turn_enabled=false (calls use Cloudflare); api_max_tasks 50 / worker 20; redis_replicas 1.
  - Do NOT copy launch.tfvars.example blindly.
- **Load-test IAM state (local):** `.claude/worktrees/tf-plan/infra/bootstrap-loadtest/terraform.tfstate`, backed up to `s3://lawbid-prod-tfstate/bootstrap-loadtest/terraform.tfstate`. Keep the tf-plan worktree; do not delete it.
- **Prod state:** `s3://lawbid-prod-tfstate/prod/terraform.tfstate`, init with `-backend-config=backend.hcl` in envs/prod.
- **Docs to read:**
  - docs/architecture/: SHARDING_READY, DB_POOLER, DB_AUTOSCALE, REDIS_AUTOSCALE, SEARCH_READY, R2_PUBLIC_MEDIA, ONLINE_DDL, GROUP_CALLS_CLOUDFLARE_SFU, BENCHMARK_BIG_APPS, P0_AND_COST_PLAN.
  - docs/runbooks/: DNS_TO_CLOUDFLARE, TURN, db-autoscale, pg-repack, redis-autoscale, DB_POOLER, batch-a-owner, paging, restore-drill, nat-endpoints.
- **Pending-owner checklist (memory):** `~/.claude/projects/-Users-sima-Desktop-LawBid/memory/release-checklist-2026-10-24.md`. Read MEMORY.md and all the files it links.

## 3. State at handoff
**Merged to main today:**
- Cloudflare TURN #299, R2 public media #303 (switch off), group calls API/app #304/#307, Mine polish #309/#310, Cloudflare parity #311.
- Own PgBouncer #312 (off), image /tmp VOLUME fix #313, shard-ready 0-2 #314, DB autoscale #315.
- Pooler max 4 #316, docs #318, batch A #320.
- Load-test fixes #300 #302 #305 #306 #308.

**Open PRs, to merge when green:**
- #317 Redis autoscale (conflict just resolved);
- #319 shard-ready 3-5;
- #321 search-ready.

**Running worker:** batch B (abuse and quotas) on `claude/batch-b-abuse`. When it reports, open a PR and merge.

**Prod:**
- The API is healthy on the old images.
- The deploy of the latest main waits for the OWNER's approval in GitHub Actions (Deploy workflow, environment production). Before approving, CANCEL older queued deploy runs: stale runs block the queue (`gh run cancel`, then `gh api -X POST .../runs/<id>/force-cancel`).
- The previous deploy rolled back because of the read-only /tmp issue; #313 fixes it.
- RDS Multi-AZ is pending for the Sunday window.
- The first AWS Backup job was started manually on 2026-10-24.

## 4. Queue — do ALL, in order (the owner wants everything, nothing skipped)
1. **Batch C** (P0_AND_COST_PLAN): SES and Stripe circuit breakers; a separate allkeys-lru cache Redis; Cache-Control on anonymous public GETs (careful: no personalized data through the CDN) and hot search cache 30-60 s; Cloudflare TURN usage via GraphQL `callsTurnUsageAdaptiveGroups`, alert at 700/1000 GB; Bunny `/statistics` polling and alerts.
2. **Batch D (after B):** the Flutter WEB Turnstile widget (web only), the honest wording fixes, and the admin «Масштаб» page: all ceilings, buttons, and alarm cards "what happened / what was done automatically / button", in the existing admin style.
3. **DB split, steps 6-10 of SHARDING_READY:** user loader, outbox for cross-family writes, feed/search/admin scatter-gather, dropping cross-family FKs, the move tool, and the admin «Разделить базу» button with checks and rollback. Use the 113 known two-DB limitations in apps/api/test/two-db-suites.json as the worklist.
4. **Redis cluster-mode readiness:** hash tags for BullMQ and Lua keys; a switch.
5. **A search alert:** search p95 above 300 ms emails «пора вынести поиск».
6. **P1, first month:** ECS canary/blue-green, Terraform drift check, an AWS FIS GameDay, cosign + SBOM, S3 Intelligent-Tiering, k6 p95 gates, push collapse keys, ARM64 + worker Spot (scripts ready: scratchpad spot-no-downtime.sh approach, `scripts/ops/arm64-check.sh`, the Mirror ClamAV workflow).
7. **Then the owner's main path:**
   - the owner pastes the Cloudflare TURN key and creates the SFU key; 1:1 and group call tests on his phones;
   - the DNS move to Cloudflare (runbook), then R2 (bucket, CORS, cache rule, verify-r2-media.sh), then flip `media.public_store`;
   - load tests on AWS (smoke, m1, m10, calls) ONLY after the moves; the `load-test.yml` workflow; each run needs his approval;
   - final iOS + Android builds on his phones (iPhone 00008150-001E545A1480401C, Samsung R5GL11433DD; prod flavor, `--dart-define-from-file=config/prod.json`), then the .aab for Google Play.

## 5. Owner to-do list (show him as a short list when relevant)
1. Approve the Deploy run in GitHub.
2. Cloudflare: TURN key into admin (Integrations → Cloudflare TURN); create the Serverless SFU app and its key; the DNS move.
3. PagerDuty Free signup; give the integration URL (docs/runbooks/paging.md).
4. Name the monthly budget ceiling. He said up to $500 is OK. Note: the cost-guard caps ECS at min when the budget is hit, so do not set it too low.
5. Delete the manual $50 budget "LawBid Monthly" in the console.
6. Run the restore drill when asked.
7. At the end: the Apple account transfer to SiMA LLC, the Stripe live key.

## 6. VERY LAST TASK (the owner's "everything is done" signal)
ONLY after every item above is finished: the verified checkmark badges (attorney green, client badge) look greyish in some themes. Fix ONLY their colors per theme (Day, Night, Blue, Green) so each is clearly visible; keep the icon shape and size. If anything else is unfinished, do NOT do this, because the owner uses it to know all work is complete.
