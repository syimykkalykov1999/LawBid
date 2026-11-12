# AI assistant («Задача для ИИ»)

## What it is
- **The worker** is the official open-source **anthropics/claude-code-action** (MIT, pinned in
  `.github/workflows/ai-assistant.yml`; `.github/THIRD_PARTY_NOTICES.md`) running in GitHub Actions.
  It is not our own agent.
- **Two ways in:**
  1. Admin → Система → **«Задача для ИИ»**: the owner writes a task. The API opens a GitHub issue
     labelled `ai-task` through the GitHub App of the infra pipeline (`github_infra`). The label
     starts the workflow.
  2. **Every 2 hours**, the workflow takes a digest from the API and decides what is a real bug. It
     opens at most 3 `ai-found` issues and at most one fix PR. The digest holds:
     - unresolved Sentry issues (existing Sentry card);
     - open CloudWatch alarms (system incidents);
     - open support tickets counted per category.

     It carries no personal data: the repository is public, so e-mails, phones, ids and tokens are
     scrubbed and tickets are counts only.
- **Rules:** `.github/ai-assistant/POLICY.md`. The assistant fixes bugs, adds tests and opens PRs.
  It never touches money, keys, IAM/Terraform, CI, stores, phone builds or migrations, and never
  merges. These rules are enforced in four places:
  1. tool allow/deny lists in the workflow (no `terraform`, `aws`, `curl`, `gh pr merge`,
     `gh secret`, force-push, `flutter`, `fastlane`);
  2. the path guard (`scripts/ai-assistant/path-guard.sh`), which closes a PR that touches a
     forbidden path;
  3. branch protection on `main` (step 5 below), so a PR still needs a human review and green CI;
  4. the workflow token's permissions, which cannot read secrets or deploy.
- **Switch Выкл / Вкл / Авто, default «Авто»** (owner rule 5c): admin setting `ai.assistant_mode`,
  with the same three buttons on the «Задача для ИИ» page.
  - **Авто:** runs by itself as soon as it is connected (GitHub App saved, `ANTHROPIC_API_KEY` and
    `AI_ASSISTANT_ENABLED` in GitHub). It pauses by itself when this month's reported cost reaches
    **`ai.monthly_max_usd`** (default $30; row «ИИ-помощник разработки» in «Расходы») and resumes
    on the 1st of the next month.
  - **Вкл:** the same. The ceiling still holds, so it is never over budget.
  - **Выкл:** never runs.

  Before every run the workflow asks the API («gate», GitHub OIDC, no shared secret). Without
  `AI_ASSISTANT_ENABLED` the workflow does not start at all.
- **Action log:** the «Задача для ИИ» page shows each task, its PR, and each run with its cost and
  journal link. The admin action is in the audit log (`ai.task_create`).

## Owner steps (once, in this order)
1. **GitHub App rights.** The App from `docs/runbooks/infra-from-admin.md` (already in Admin →
   Ключи и сервисы → «GitHub: изменения облака») also needs Issues and Pull requests:
   GitHub → Settings → Developer settings → GitHub Apps → the App → **Permissions & events** →
   Repository permissions → **Issues: Read and write**, **Pull requests: Read-only** → Save. Then
   GitHub → Settings → Applications → the App → **Review request** → **Accept new permissions**.
   If the App is not created yet, follow `infra-from-admin.md` steps 1–2 first.
2. **Claude GitHub App** (lets the assistant push its branch and open PRs whose CI runs):
   open https://github.com/apps/claude → **Install** → only this repository → Install.
3. **Anthropic key.** console.anthropic.com → **API keys** → Create key. Optional: Settings →
   Limits → set a monthly spend limit as a second ceiling. Then GitHub → the repository →
   Settings → Secrets and variables → Actions → **New repository secret** →
   `ANTHROPIC_API_KEY` = the key.
4. **Repository variables** (same page, tab **Variables**):
   - `AI_ASSISTANT_ENABLED` = `true`;
   - `AI_ASSISTANT_APP_LOGIN` = the App's bot login (GitHub → the App's page; it looks like
     `<app-name>[bot]`), so tasks opened by the admin are accepted.
5. **Branch protection** (if not set yet): GitHub → Settings → Branches → **Add rule** for
   `main` → tick **Require a pull request before merging** (1 approval) and **Require status
   checks to pass** → Save.
6. **Nothing to switch on.** The switch is already «Авто», so the assistant starts by itself after
   steps 1–4. Optional: change the ceiling in Admin → Настройки → `ai.monthly_max_usd`
   (default $30) with the 2FA code. The «Задача для ИИ» page shows «Авто» highlighted and «GitHub
   подключён».

To stop it: press «Выкл» on the «Задача для ИИ» page (the next run refuses), or delete the
variable `AI_ASSISTANT_ENABLED` (the workflow does not start at all).

## Reacting at once (12.11.2026): alarms and new Sentry errors
Besides the 2-hour look, the API starts `ai-assistant.yml` (workflow_dispatch, inputs `reason`,
`alarm`, `issue`) the moment something breaks, through the same GitHub App and the same gate
(Выкл → nothing; month ceiling). At most one run per alarm name / Sentry issue per hour (Redis
`ai:trigger:*`). The inputs are scrubbed (no e-mails, phones, ids, tokens) and the prompt treats
them as data, not instructions.
- **CloudWatch alarm → run.** The alarm-hook Lambda (`infra/modules/monitoring/journey.tf`) posts
  every state change to `POST /api/v1/internal/alarm-events`; on `ALARM` the API dispatches with
  `reason=alarm`. In prod `alarm_incident_hook_enabled` now defaults to `true`: the URL comes from
  `api_host`, the token is generated by Terraform (`lawbid-prod/ALARM_HOOK_TOKEN` in Secrets
  Manager) and read by the API as `ALARM_HOOK_TOKEN`. Owner step: one `terraform apply` of prod
  (plan shows the Lambda, its role/log group, the SNS subscription, the secret and a new API task
  definition). If the prod `terraform.tfvars` secret sets `alarm_incident_hook_enabled = false`,
  delete that line first.
- **New Sentry error → run.** Sentry → Settings → Developer Settings → **Create New Integration**
  → **Internal Integration** (name `lawbid-ai`): Webhook URL
  `https://api.lawbid.dev/api/v1/webhooks/sentry`, Permissions **Issue & Event: Read**, Webhooks:
  tick **issue** → Save. Copy its **Client Secret** to Admin → Ключи и сервисы → «Sentry: вебхук
  для ИИ-помощника» → Сохранить (2FA) → Включить. Only a newly created issue at level `error` or
  `fatal` starts a run; the signature (`sentry-hook-signature`, HMAC-SHA256) is checked, anything
  else gets 404.
