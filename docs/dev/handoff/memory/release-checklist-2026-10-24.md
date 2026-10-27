---
name: release-checklist-2026-10-24
description: Owner-approved pre-release checklist given 2026-10-24; he will ask at the end whether every item is done
metadata:
  type: project
---
The owner saved this list and will check it at the end. Mark items done only after verifying them.
Order and estimated hours:
1. Merge PR #303 (R2 public media, switch off) and #304 (group calls API). ~0.5 h.
2. Load tests — PAUSED by the owner 2026-10-24 until all fixes are in (each failed run costs money). Fixes so far: PR #300, #302, #305, #306, #308; leftover cleanup scripts fix-loadtest*.sh in the scratchpad. Order when resumed (owner 2026-10-24). Each run needs his GitHub approval; fix what they find. ~6 h.
   a) Now: smoke, then m1 (1M/day), then m10 (10M/day) for the server. R2 is not needed for these.
   b) After the Cloudflare TURN and SFU keys: a separate calls test (calls-smoke, then calls-full), 1:1 and group.
   c) After the R2 switch: a short check that photos and avatars load.
3. Group calls in the app via Cloudflare SFU, with the UI unchanged ([[ui-frozen]]) and the outage message. ~3 h.
4. CANCELLED by the owner 2026-10-24: no end-to-end encryption of group calls (it needs device keys, and web may break). Do not re-propose it.
5. Prod Run for metrics off + Spot 1:1 (PR #301). ~0.5 h.
6. ARM: mirror ClamAV-debian, test on the load stand, then the prod Run. ~1 h.
7. After his TURN key: test 1:1 calls via Cloudflare, then remove the second own TURN server (keep one t4g.small as backup). ~0.5 h.
8. After his SFU key: test group calls on 3-4 phones. ~1 h.
9. R2: guide the owner through moving lawbid.dev DNS to Cloudflare, plus bucket, domain and token; staging upload; switch on; migrate old photos. ~1 h, plus DNS wait.
10. Deploy the new server version (Deploy workflow; he approves production). ~0.5 h.
11. Final iOS + Android builds on his phones, plus the .aab for Google Play. ~1.5 h.
Total ~18 h of work, plus waits for his actions.
Owner actions:
- Approve the tests.
- Cloudflare TURN key now; SFU key later.
- DNS move.
- Run buttons.
- Approve the deploy.
- Check the builds.
- Apple LLC transfer and Stripe live key.
Related: [[prod-state-2026-10-24]], [[owner-short-answers]]
Night 2026-10-24 status:
- Merged: #299 TURN, #303 R2, #304/#307 group calls, #309/#310 Mine polish, #311 Cloudflare parity, plus loadtest fixes #300/#302/#305/#306/#308.
- Prod: Insights off, both own TURN servers deleted, backups and Redis failover on.
- Morning order:
  (1) owner Runs prod-a7.plan (new alarms). Do this BEFORE approving Deploy, because tfvars images are old and the plan would roll the worker task def back after a deploy.
  (2) approve Deploy run 40105454475.
  (3) owner pastes the TURN key in admin; then 1:1 call test on phones.
  (4) owner creates the SFU key; group call test on 3-4 phones.
  (5) DNS move per DNS_TO_CLOUDFLARE.md; R2 bucket, CORS and cache; switch media.public_store.
  (6) optional spot-no-downtime.sh.
  (7) approve Mirror ClamAV run 40096694128 (ARM later).
  (8) fresh builds on both phones.
- Held for the owner: branch claude/mine-menus-polish (menu rewrites).
Owner 2026-10-24 (DB, top priority, ahead of release):
- (a) own PgBouncer pooler, no paid RDS Proxy;
- (b) shard-ready steps 0-5 from docs/architecture/SHARDING_READY.md, done now;
- (c) automatic DB upsize when the DB is under load, with an email to the owner.
AWS load tests and other work wait until the DB work is done.
Cost audit 2026-10-24, the fix queue (run after the shard-ready-2 and search-ready workers):
- (1) AWS Budgets set to the real ceiling (~$1.2k) with forecast alerts; remove the $50 budget; check auto-scale-down on budget.
- (2) A separate allkeys-lru cache Redis, or a 70 % memory alarm, so cache keys cannot stop the queues.
- (3) SMS daily budget cap in admin (pumping).
- (4) Verify the AWS Backup selection; the vault has 0 recovery points.
- (5) TURN/SFU egress alert at 700 GB and a hard stop at 950 GB.
- (6) Worker on Spot via the no-downtime script.
- (7) Daily caps in admin for Rekognition, Persona and Translate.
- (8) Cache-Control on public GETs; cache hot search 30-60 s.
- (9) Measure NAT; add VPC endpoints if it is over 150 GB.
- (10) ARM64, then worker memory 4 GB to 2 GB.
- (11) Bunny per-user/day upload cap and bandwidth alert.
NOT doing: lowering the ECS caps (the owner wants 50); dropping the Redis replica (the owner chose redundancy).
Also queued: admin «Масштаб» page with alarm cards (what happened / what was done automatically / a button), DB split button (steps 6-10), Redis cluster-mode readiness.
Benchmark 2026-10-24 (docs/architecture/BENCHMARK_BIG_APPS.md, written from memory, NOT web-verified, so verify each item with real research before building).
P0 before release:
- phone paging (AWS Chatbot + a free paging tier);
- logged restore drill + RDS failover test;
- audit the prod security flags (Object Lock, Vault Lock, KMS rotation, WAF);
- Turnstile on signup/OTP + enforce App Check;
- per-user upload quota;
- circuit breakers on Twilio, SES and Stripe;
- honest privacy wording: server-side encryption, not end-to-end.
P1 first month: ECS canary/blue-green, drift check, FIS GameDay, cosign + SBOM, Intelligent-Tiering, k6 p95 gates, push collapse keys, ARM/Spot.
Growth signals: read replica, delta sync, pg_partman, second region, websocket scale, Bot Control, true end-to-end.
VERY LAST TASK, only after EVERYTHING else is done (it is the owner's completion signal; if anything is unfinished, do NOT do it):
the verified checkmark badges (green for attorneys, and the client badge too) look greyish in some themes. Fix ONLY their colors per theme (Day, Night, Blue, Green) so each is clearly visible. Do not change the icon shape or size.
Queued 2026-10-25 (owner OK):
- attorney license expiry date + reminders + auto un-verify (research first);
- check the referral bonus: only on the first completed case, with expiry.
Owner 2026-10-25: PRIORITY NOW is the core platform only. Order: DB split (steps 9-10 + the «Разделить базу» button), Redis cluster readiness, the search p95 alert, then P1 infra. Do not start small product features such as referrals before these.
- 2026-10-25: after systems work, build desktop-class web (full plan, no stops); phone look unchanged, verified by goldens.
- 2026-10-26 owner: programmatic SEO/ASO (pSEO) approved: self-scaling public pages for attorneys/posts/practice×city, prebuilt into CDN, zero API/DB load, no cost surprises, quality gates; do after the merge train, before desktop web.
