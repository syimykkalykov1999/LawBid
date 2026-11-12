# AI assistant («Задача для ИИ»)

## What it is
- **The worker** is the official open-source **anthropics/claude-code-action** (MIT, pinned in
  `.github/workflows/ai-assistant.yml`; `.github/THIRD_PARTY_NOTICES.md`) running in GitHub Actions.
  It is not our own agent.
- **12.11.2026 (owner: «работать точь в точь как прораб»).** It watches the project, fixes
  properly and asks the owner for permission. It may change any code by PR, including money
  modules, migrations, admin and infra code. Every PR waits for the owner's «Разрешить» with a 2FA
  code. Hard walls (`.github/ai-assistant/POLICY.md`, `scripts/ai-assistant/path-guard.sh`):
  - no running payments;
  - no real people's data;
  - no secrets or keys;
  - no `.github/` (workflows run with the repository's secrets);
  - no `infra/bootstrap*`, no terraform apply;
  - no store or signing keys;
  - no force-push or rebase;
  - no rule files.
- **Switch `ai.assistant_mode`** (three buttons on the page, default «Авто»):
  - **Выкл:** nothing runs.
  - **Авто:** every 2 hours it looks at the digest from the API: Sentry, open alarms and open
    support tickets per category. It opens at most 3 `ai-found` issues and at most one fix PR. It
    does **not** take tasks from the admin.
  - **Вкл:** Авто plus the owner's tasks from the admin («Задача для ИИ» → GitHub issue labelled
    `ai-task`). «Следи за проектом» means Авто or Вкл.

  In every mode the month ceiling `ai.monthly_max_usd` holds (default $30). At the ceiling it
  pauses and resumes next month. Before every run the workflow asks the API («gate», GitHub OIDC,
  no shared secret) and says whether it is the scheduled look or a task.
- **«Разрешить» / «Отклонить».** The page lists the AI's open PRs (branches `ai/…` of this
  repository, never a fork). Each row shows the CI state, what/why from the PR body and the run
  cost. **«Разрешить (код 2FA)»** asks for a fresh authenticator code. The API then reads
  everything again from GitHub and merges only if all of these hold:
  1. the PR is open, into `main`, from an `ai/` branch of this repository;
  2. its head is the same commit the owner saw (sha sent from the page);
  3. every check on that commit is green;
  4. the path guard is clean on its changed files (read from GitHub);
  5. no other AI merge is running (Redis lock).

  The merge is a squash pinned to that sha (GitHub refuses if the branch moved). The App token
  is narrowed to `contents` + `pull_requests: write` for that one call. **«Отклонить»** closes the
  PR with a comment. Both go to the audit log (`ai.pull_merge`, `ai.pull_reject`, next to
  `ai.task_create`).
- **Enforced in four places:**
  1. the workflow's tool lists (no `terraform`, `aws`, `curl`, `gh pr merge`, `gh secret`,
     force-push, `flutter`, `fastlane`);
  2. the path guard, which closes a PR that touches a wall;
  3. the same guard re-run by the API before a merge;
  4. the owner's 2FA.

## Owner steps (once, in this order)
1. **Права GitHub-приложения.** Это приложение из `docs/runbooks/infra-from-admin.md`; в админке
   оно есть в «Ключи и сервисы» → «GitHub: изменения облака».
   1. GitHub → Settings → Developer settings → GitHub Apps → это приложение → **Permissions &
      events** → Repository permissions. Поставьте:
      - **Contents: Read and write** (чтобы вливать PR);
      - **Pull requests: Read and write** (видеть и закрывать PR);
      - **Issues: Read and write** (задачи);
      - **Checks: Read-only** и **Commit statuses: Read-only** (видеть, зелёный ли CI).
   2. Нажмите **Save**.
   3. GitHub → Settings → Applications → это приложение → **Review request** → **Accept new
      permissions**.
2. **Claude GitHub App** (помощник сам пушит ветку и открывает PR, и на нём идёт CI): откройте
   https://github.com/apps/claude → **Install** → только этот репозиторий → Install.
3. **Ключ Anthropic.**
   1. console.anthropic.com → **API keys** → Create key. Можно ещё в Settings → Limits поставить
      месячный лимит как второй потолок.
   2. GitHub → репозиторий → Settings → Secrets and variables → Actions → **New repository
      secret** → `ANTHROPIC_API_KEY` = ключ.
4. **Переменные репозитория** (та же страница, вкладка **Variables**):
   - `AI_ASSISTANT_ENABLED` = `true`;
   - `AI_ASSISTANT_APP_LOGIN` = логин бота приложения. Он виден на странице приложения и выглядит
     как `<имя>[bot]`. Нужен, чтобы задачи из админки принимались.
5. **Защита ветки main** (по желанию). GitHub → Settings → Branches → правило для `main` →
   **Require status checks to pass**. Если включите и **Require a pull request before merging**
   с одобрением: в том же правиле добавьте это GitHub-приложение в **Allow specified actors to
   bypass required pull requests**. Одобрение у нас — это ваш код 2FA в админке.
6. **Включение.** Переключатель уже стоит на «Авто»: после шагов 1–4 помощник сам смотрит
   ошибки раз в 2 часа и присылает PR. Чтобы он брал и ваши задачи, нажмите «Вкл» на странице
   «Задача для ИИ» и введите код 2FA. PR появляются в блоке «PR от ИИ». Прочитайте «что и
   почему», дождитесь «CI зелёный», затем нажмите «Разрешить (код 2FA)» или «Отклонить».

Остановить: нажмите «Выкл» на странице «Задача для ИИ» (следующий запуск откажется). Другой
способ: удалите переменную `AI_ASSISTANT_ENABLED`, тогда workflow не запустится совсем.

## Screenshots, models and cleanup (owner 2026-11-12, rows 48, 49, 55)
- **Screenshots.** On «Новая задача» the owner pastes (Ctrl/⌘+V), drops or picks up to 10 pictures
  (JPEG, PNG, GIF, WebP, 10 MB each). They go through the normal files pipeline into the private
  bucket (purpose `ai_attachment`, magic bytes, antivirus, re-encoded without EXIF / GPS). The
  public issue gets only one line `AI attachments: <ids>` (opaque ids, never a link or bytes).
  The workflow step «Pictures» reads the ids, fetches the pictures from
  `POST /api/v1/ai-assistant/workflow/attachments` (GitHub OIDC, only rows of that issue) into
  `.ai-attachments/` on the runner (git-excluded, forbidden by the path guard, removed after the
  run) and lists the paths in Claude's prompt.
- **Model.** `ai.assistant_model` (default `claude-opus-5-5`), picked on the page from the known
  list; a change needs a fresh 2FA code. The gate answers it; the workflow accepts only a known
  model id (anything else runs Opus 5.5).
- **Branches.** `delete_branch_on_merge` is off in the repository, so the API deletes the `ai/…`
  branch itself after «Разрешить» (merge) and «Отклонить» (close). Only `ai/` branches.
- **Cleanup.** Pictures go `ai.retention_images_days` (15, 0 = keep forever) after the task
  closes (issue closed, PR merged or rejected; a task the API never saw closed counts as closed
  after 30 days). «Хранение» on the page: change the days (2FA) or «Очистить сейчас» (2FA, audit
  row `ai.retention_purge`). Nightly cron `ai.retention`.
