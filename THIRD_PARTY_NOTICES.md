# Third-party notices (LawBid)

LawBid uses open-source software and, by RULE #1 (`AGENTS.md`), copies proven
MIT / Apache-2.0 / BSD code as is with its notice. This file is the index:
the full notices live next to the code that ships them.

| Part | Notices file | Reaches users? |
|---|---|---|
| Phone app and web app (Flutter) | [`apps/mobile/THIRD_PARTY_NOTICES.md`](apps/mobile/THIRD_PARTY_NOTICES.md) — code copied into the app, vendored web files (Mediabunny MPL-2.0, owner exception 2026-11-08), native iOS/Android SDKs, fonts and pictures | Yes. Flutter adds every Dart package's LICENSE to the app; `lib/core/licenses/bundled_licenses.dart` adds this file's sections and the font licences to the same list |
| Admin (Next.js) | [`apps/admin/THIRD_PARTY_NOTICES.md`](apps/admin/THIRD_PARTY_NOTICES.md) | Staff browsers |
| API server | [`apps/api/THIRD_PARTY_NOTICES.md`](apps/api/THIRD_PARTY_NOTICES.md) — copied code, password list, PDF fonts, server-only LGPL / EPL / FSL packages with their source | No (runs on our servers; PDFs carry embedded Noto font subsets, OFL) |
| CI workflows | [`.github/THIRD_PARTY_NOTICES.md`](.github/THIRD_PARTY_NOTICES.md) | No |
| Practice photos | [`docs/PHOTO_CREDITS.md`](docs/PHOTO_CREDITS.md) (Unsplash License) | Yes |

The licence of every dependency (npm, pub, Swift packages, Gradle, Docker
images, assets) with its verdict: [`docs/dev/LICENSE_AUDIT_2026-11-17.md`](docs/dev/LICENSE_AUDIT_2026-11-17.md).

## Container base images (run on our servers, not distributed)

| Image | Licence |
|---|---|
| `node:26.13.1-alpine` (API, admin) | Node.js MIT; Alpine Linux packages under their own licences (musl MIT, BusyBox GPL-2.0, OpenSSL Apache-2.0) |
| `alpine:3.24.4` + PgBouncer (`infra/pgbouncer`) | PgBouncer ISC |
| `postgres` (local, self-host, backups) | PostgreSQL License |
| `valkey/valkey:9.1.3-alpine` | BSD-3-Clause |
| `coturn/coturn` (TURN) | BSD-3-Clause |
| `quay.io/minio/minio` (local dev and the hidden self-host stack only) | AGPL-3.0, used unmodified; see the audit |
| `mailhog/mailhog` (local dev only) | MIT |
| `public.ecr.aws/aws-observability/aws-otel-collector:v0.51.0` (ADOT collector sidecar, only while `tracing_enabled`; its `tail_sampling` processor is OpenTelemetry Collector contrib, configured as documented) | Apache-2.0, used unmodified |
