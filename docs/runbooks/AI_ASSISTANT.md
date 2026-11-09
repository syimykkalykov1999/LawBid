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
- **Off by default, two switches:**
  - repository variable `AI_ASSISTANT_ENABLED`;
  - admin setting `ai.assistant_mode` (`off` / `on`).

  Before every run the workflow asks the API («gate», GitHub OIDC, no shared secret). The API says
  no while the setting is off, while the GitHub App is not saved, or when this month's reported
  cost reached **`ai.monthly_max_usd`** (default $30; row «ИИ-помощник разработки» in «Расходы»).
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
6. **Admin:** Настройки → `ai.assistant_mode` = `on`, `ai.monthly_max_usd` = your ceiling →
   save with the 2FA code. The «Задача для ИИ» page must then show «Включён» and «GitHub
   подключён».

To turn it off: `ai.assistant_mode` = `off` (the next run refuses), or delete the variable
`AI_ASSISTANT_ENABLED` (the workflow does not start at all).
