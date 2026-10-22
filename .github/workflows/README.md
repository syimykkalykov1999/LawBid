# CI workflows

Implements docs/01_FOUNDATION_AUTH.md §16 (file 1's Definition of Done):
"CI зелёный (lint, unit, e2e, сборка Android и iOS)". Full CI/CD scope
(deploys, OpenAPI/Dart-client contract diffing, Fastlane mobile releases,
load/security test suites) is docs/06_PRODUCTION.md §7 — file 6, not
implemented here; see the note in each workflow file for exactly which
subset of §7.2's eventual PR-check list it covers today.

| Workflow | Triggers | What it does |
|---|---|---|
| `api-ci.yml` | PR/push to `main`/`master` touching `apps/api/**`, root `package(-lock).json`, or `docker-compose.yml` | Starts CockroachDB v24.1.5 + Redis 7 + Mailhog (matching `docker-compose.yml`), runs `npm ci`, `prisma generate`/`validate`/`migrate deploy`, `npm run lint` (+ a check that `--fix` didn't need to change anything), `tsc --noEmit`, `npm run test:cov`, `npm run test:e2e` against the real service containers, and a blocking `npm audit` gate at high severity (`scripts/ci/npm-audit-gate.mjs`, exceptions in `.github/npm-audit-allowlist.json`). |
| `mobile-ci.yml` | PR/push to `main`/`master` touching `apps/mobile/**` | `analyze-and-test` (macOS runner — see file comment for why): `flutter pub get`, codegen (`build_runner`), `flutter analyze`, blocking hardcoded-string/hardcoded-color scans of `lib/` against a baseline (`apps/mobile/tool/ci/hardcoded_check.py`), `flutter test` (unit/widget/golden). `build-android` (Ubuntu) and `build-ios` (macOS) then each build an unsigned debug build as a build-check only — no signing, no store upload. |
| `secret-scan.yml` | PR/push to `main`/`master`, repo-wide | `gitleaks` — diff-only on PRs, full scan on push to a protected branch. |
| `deploy.yml` | push to `main` touching api/admin/packages, or manual dispatch with an image tag | docs/06 §7.3: build + push `lawbid-api` / `lawbid-admin` images to ECR → staging (migrations task, rolling deploy, smoke) → `production` environment with required reviewers → backup freshness check → migrations task → rolling deploy → smoke. Rollback of a failed rollout is the ECS circuit breaker (infra). Scripts in `scripts/deploy/`. |
| `rollback.yml` | manual dispatch with a previous image tag | One-button rollback of production: checks the tag exists in ECR, rolls api / worker / admin back to it (same `roll-services.sh`), smoke. Skips staging and migrations (expand/contract keeps the old release compatible). Goes through the `production` environment reviewers. |
| `mobile-release.yml` | tags `v*.*.*`, or manual dispatch (`upload`, `flavor`) | docs/06 §7.4: release notes from Conventional Commits, Fastlane `build` lanes for Android (AAB, upload keystore from secrets) and iOS (IPA, certificate/profile from secrets), artifacts + GitHub release. Store uploads (Play Internal, TestFlight) run only on manual dispatch with `upload=true` — the owner decides the closed-beta moment (§11.2). |

## Known judgment calls (see docs/CHANGELOG.md's CI-pipeline entry for the full reasoning)

- Audit #15 (2026-10-22): the hardcoded-string and hardcoded-colour checks in
  `mobile-ci.yml` are **blocking** against a baseline of the findings that
  already existed (`apps/mobile/tool/ci/hardcoded_*.allow`). New ones fail;
  how to fix or allow one is in the header of `tool/ci/hardcoded_check.py`.
- `npm audit` at high severity in `api-ci.yml` is **blocking** too. An
  advisory that cannot be fixed yet goes in `.github/npm-audit-allowlist.json`
  with a GHSA id, a reason and an expiry date (an expired entry fails again).
  See the header of `scripts/ci/npm-audit-gate.mjs`.
- `analyze-and-test` in `mobile-ci.yml` runs on `macos-latest`, not the
  usual `ubuntu-latest`, because this repo's golden tests render real
  embedded fonts and were generated on macOS — see the in-file comment.
- Flutter/Dart version is `channel: stable` (unpinned), not a pinned exact
  version, because `pubspec.yaml` only declares a floor and pinning the
  historical floor risked breaking codegen against the newer analyzer the
  project has since migrated to. See the in-file comment.

**Unverified end-to-end**: these workflows were authored and YAML-validated
from a bridge with no access to a GitHub Actions runner, Docker, or the
Flutter/Dart toolchain — see docs/CHANGELOG.md's CI-pipeline entry for
exactly what was and wasn't locally verified. The real test is the first
PR/push against `main`/`master` after this commit.

## Supply chain (security research #5, 2026-10-22, A1–A2)

- **Every `uses:` is pinned to a full commit SHA** with the version in a
  trailing comment (`actions/checkout@11d5960a… # v4.4.0`). A moving tag
  (`@v4`) can be re-pointed by whoever controls the action's repository —
  that is how `tj-actions/changed-files` (CVE-2025-30066) leaked CI secrets
  from thousands of repositories. Dependabot (`github-actions` ecosystem)
  updates the SHA and the comment together. To bump one by hand: resolve
  the tag with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (an
  annotated tag needs one more hop through `git/tags/<sha>`) and paste the
  commit SHA.
- **Every workflow declares top-level `permissions:`** — `contents: read`
  unless a job needs more (`id-token: write` for the OIDC deploy roles,
  `security-events: write` for CodeQL / Trivy SARIF, `contents: write`
  for the mobile GitHub release). A job never gets the repository-wide
  default token.
- **`npm ci` runs with `ignore-scripts=true`** (root `.npmrc`, copied into
  both Docker builds): no dependency runs code during installation. The
  scripts we need run explicitly (`npx prisma generate` downloads Prisma's
  engines; `npm run prepare` once after cloning installs the husky hooks).
  `min-release-age=7` in the same file and `cooldown` in
  `.github/dependabot.yml` keep a version that is less than a week old out
  of the tree (security updates skip the cooldown).
- Owner steps (GitHub → Settings): Actions → General → *Workflow
  permissions: Read repository contents and packages* and *Require
  approval for all outside collaborators*; Branches → `main`: require the
  CI checks, forbid force pushes.
