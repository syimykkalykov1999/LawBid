# Infra switches from the admin (runbook)

Owner 2026-10-26. Guide for the owner: admin → Инструкции → «Как включить что-то в облаке одной кнопкой».

## What it is

Выкл / Вкл on a Terraform row of «Расходы» / «Масштаб» → `POST /admin/infra/requests`
→ API row in `infra_change_requests` (status `requested`, cost delta from the cost registry)
→ API starts `.github/workflows/infra-apply.yml` (GitHub App installation token, `actions: write`, this repo only)
→ workflow: take the job (`POST /api/v1/infra/workflow/requests/:id/start`, GitHub OIDC token) →
`scripts/infra/write-switch.mjs` writes `infra/envs/prod/growth.auto.tfvars.json` (whitelist + JSON schema) →
`terraform plan -out=plan.bin` → `scripts/infra/plan-summary.mjs` (addresses only; refuses data loss) →
`POST …/plan` (status `planned`; `dry_run` in dry-run mode, the run ends)
→ owner opens «План: …», confirms with a fresh 2FA code (`POST /admin/infra/requests/:id/confirm`, step-up; quiet hours checked)
→ workflow polls `GET …/decision` every 20 s (≤ 30 min) → `terraform apply plan.bin` (that exact plan;
Terraform refuses a stale saved plan) → commits the JSON to main (or opens a PR if main is protected) → `POST …/status done|failed`.
«Откатить» = a new request to the opposite position (same flow); when it is done the original is `rolled_back`.

States: requested → planning → planned → confirmed → applying → done; failed / expired (plan 30 min) /
cancelled / dry_run / rolled_back. One active request at a time (partial unique index
`infra_change_requests_one_active`). Time limits are applied on every read (no cron).

## Guards

| Guard | Where |
|---|---|
| Whitelist: booleans, whole numbers in range, one word of a fixed list; no secrets/ARNs/lists | `apps/api/src/common/ops/infra-switches.ts`, schema `infra/envs/prod/growth.auto.tfvars.schema.json`, `scripts/infra/write-switch.mjs` (jest keeps all three equal) |
| Rows never offered: backups, RDS Proxy (needs an ARN), VPC endpoint list, primary DB / Redis sizes | same file |
| Plan that destroys DB/bucket/KMS/secret/backup vault/Redis/ECR → refused (read replica may go) | `plan-summary.mjs` + API `forbiddenDestroys` + IAM Deny |
| Concurrency 1 | DB unique index + workflow `concurrency: infra-apply` |
| Daily cap (default 3) | setting `infra.daily_cap` |
| Quiet hours for apply (`HH:MM-HH:MM`, Chicago; empty = any) | setting `infra.quiet_hours` |
| Dry-run (default ON) | setting `infra.dry_run` |
| Plan TTL 30 min, start TTL 60 min, apply TTL 3 h | `infra-change.logic.ts` |
| OFF→ON needs a registry price | `createRefusal` |
| 2FA, no second admin | `assertStepUp` on confirm |
| Only this workflow file on main can call back | GitHub OIDC: issuer, audience `lawbid-infra-apply`, `repository`, `job_workflow_ref`, `ref` |

## Owner steps (once)

1. **GitHub App** (github.com → Settings → Developer settings → GitHub Apps → New): name `lawbid-infra`,
   no webhook, Repository permissions **Actions: Read and write**, **Contents: Read**; install it on THIS
   repository only. Note the App ID and the Installation ID (URL of the installation page), generate a private key (.pem).
2. Admin → Интеграции → «GitHub: изменения облака (GitHub App)»: repo, App ID, Installation ID, private key.
   (Stored KMS-encrypted in the app's key vault, like every other provider key; never in the repo.)
3. **AWS role**: in `infra/bootstrap` set `infra_apply_enabled = true` and run `terraform apply` there
   (adds trust for the GitHub environment `infra-apply`, ReadOnlyAccess, the `infra-apply` inline policy with the Deny list).
4. GitHub → Settings → Environments → New `infra-apply` (no reviewers: the 2FA in the admin is the gate;
   add yourself as a reviewer only if you want a second click). Deployment branches: `main` only.
5. Optional: repository variable `LAWBID_API_URL` (default `https://api.lawbid.dev`).
6. Optional: allow GitHub Actions to push to main (ruleset bypass) so the JSON is recorded directly; otherwise
   every apply opens a small PR «infra: record …» — merge it (until merged, the next plan would undo the change, the
   plan sheet shows it).
7. Try once with `infra.dry_run = true`, read the plan, then set `infra.dry_run = false`.

## Troubleshooting

- «GitHub-приложение … не подключено» → step 2. «GitHub не запустил процесс (HTTP 404)» → App not installed on the repo
  or the workflow file is not on main. HTTP 403 → the App lacks Actions: write.
- Request stuck in «Готовится план» > 60 min → marked failed automatically; open the run link.
- 401 from the API in the workflow log → the run is not from `main` / not this file, or `LAWBID_API_URL` points elsewhere.
- Apply failed: the request is `failed`, AWS may be half-changed (Terraform is idempotent): press the switch again
  for a fresh plan, or «Откатить» the last done request.
- Never apply by hand from a laptop while a request is `applying` (state lock).

## Cost

$0: GitHub Actions minutes (public repo / free tier) and a few API rows. What you switch on costs what the plan shows.
