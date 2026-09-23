# CI workflows

Implements docs/01_FOUNDATION_AUTH.md §16 (file 1's Definition of Done):
"CI зелёный (lint, unit, e2e, сборка Android и iOS)". Full CI/CD scope
(deploys, OpenAPI/Dart-client contract diffing, Fastlane mobile releases,
load/security test suites) is docs/06_PRODUCTION.md §7 — file 6, not
implemented here; see the note in each workflow file for exactly which
subset of §7.2's eventual PR-check list it covers today.

| Workflow | Triggers | What it does |
|---|---|---|
| `api-ci.yml` | PR/push to `main`/`master` touching `apps/api/**`, root `package(-lock).json`, or `docker-compose.yml` | Starts CockroachDB v24.1.5 + Redis 7 + Mailhog (matching `docker-compose.yml`), runs `npm ci`, `prisma generate`/`validate`/`migrate deploy`, `npm run lint` (+ a check that `--fix` didn't need to change anything), `tsc --noEmit`, `npm run test:cov`, `npm run test:e2e` against the real service containers, and an advisory `npm audit --audit-level=high`. |
| `mobile-ci.yml` | PR/push to `main`/`master` touching `apps/mobile/**` | `analyze-and-test` (macOS runner — see file comment for why): `flutter pub get`, codegen (`build_runner`), `flutter analyze`, advisory hardcoded-string/hardcoded-color scans of `lib/`, `flutter test` (unit/widget/golden). `build-android` (Ubuntu) and `build-ios` (macOS) then each build an unsigned debug build as a build-check only — no signing, no store upload. |
| `secret-scan.yml` | PR/push to `main`/`master`, repo-wide | `gitleaks` — diff-only on PRs, full scan on push to a protected branch. |

## Known judgment calls (see docs/CHANGELOG.md's CI-pipeline entry for the full reasoning)

- The hardcoded-string-literal and hardcoded-color checks in `mobile-ci.yml`
  are **advisory** (`continue-on-error: true`), not blocking, because a real
  scan of the current `lib/` tree found pre-existing violations outside
  this task's scope to fix. Tighten to blocking once those are cleared.
- `npm audit --audit-level=high` in `api-ci.yml` is **advisory** for the
  same reason: 9 pre-existing high-severity transitive vulnerabilities
  (`multer` via `@nestjs/platform-express`, `uuid` via `exceljs`) need a
  dedicated breaking-change dependency-upgrade pass, not a silent
  `--force` inside this CI-pipeline task.
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
