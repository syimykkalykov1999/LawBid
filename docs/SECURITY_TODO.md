# Security follow-ups (open)

Items from `docs/perf/SYSTEM_AUDIT_2_2026-10-22.md` that were planned but not built yet.

## Message encryption (audit #6, part 2)

Part 1 is done (`apps/api/src/common/secrets/message-body-cipher.ts`):
- New bodies are `enc:v3.<kid>.<iv>.<tag>.<ct>`. Their AAD is `messages.body:<messageId>`, so a ciphertext copied to another message does not open.
- Old `enc:v2…` rows still open.
- If a body fails to decrypt, the API logs a warning with the message id and key id (never the text) and returns `''`. The app then shows «Не удалось расшифровать».

Still to do:

1. **Re-encryption job.** A background job that walks `messages` (`body_original`, `body_display`) and `message_edits.body_original` in batches. It rewrites every `enc:v2…` row, and every row under a retired key id, as `enc:v3` with the active key. Edit copies use their `message_id` as the AAD id. It must be resumable (keyset by id), throttled, and must count failures without logging any text. Once it reports zero rows for a key id, that key can leave `MESSAGE_ENC_KEYS`. Until then **no key id may be removed**: rows under a removed key read as `''`. Look for the warning `Message body failed to decrypt` in the logs.
2. **KMS-wrapped keys.** `MESSAGE_ENC_KEYS` should hold data keys encrypted by an AWS KMS key, not raw secrets in the task environment. At boot the API calls `kms:Decrypt` once per kid, keeps the plaintext key only in memory, and the IAM role gets `kms:Decrypt` on that key alone. Rotating a key then means a new data key plus the re-encryption job above.
3. **Data-only pushes (later).** Push bodies still carry the masked text to FCM/APNs (`notifications/push/push-dispatcher.ts`). The goal is for the device to fetch or decrypt the text itself.

## Dependencies left after `npm audit fix` (security audit #3, finding 9)

`npm audit fix` (without `--force`) on 2026-10-22 moved `next` 15.5.26 → 15.5.28 (the admin), `source-map-js` 1.2.1 → 1.2.2 and, in dev tools only, `vite`, `ts-jest` and `babel-plugin-istanbul`. The API audit gate (`scripts/ci/npm-audit-gate.mjs --workspace apps/api`) passes. These advisories remain, because each fix is a major upgrade (skipped on purpose):

| Advisory | Where | The fix npm offers | Notes |
| --- | --- | --- | --- |
| `deepmerge-ts <8` (high, GHSA-ggr8-5vv4-36mx) | `prisma` → `@prisma/config` | Prisma 7 | Build-time CLI only, never in the running API. Already in `.github/npm-audit-allowlist.json` until 2027-01-31. |
| `postcss ≤8.5.22` (high, GHSA-qx2v-qp2m-jg93 and the source-map ones) | `next/node_modules/postcss` (the admin build) | Next 16 | Next 15 pins its own postcss. It only runs on our own CSS at build time, never on user input. |
| `js-yaml 5.0–5.4` (moderate) | `@nestjs/swagger` | `@nestjs/swagger` 12 | Swagger is off in prod. |
| `uuid <11.1.1` (moderate) | `exceljs` (and `autocannon` in dev) | an older `exceljs` | Only v3/v5/v6 with a caller buffer are affected; exceljs uses v4. |

Two options, each to be done in its own branch with a full CI run: (a) the major upgrades (Prisma 7, Next 16, `@nestjs/swagger` 12); or (b) `overrides` in the root `package.json` that pin the patched minor versions (`postcss@^8.5.23` under `next`, `js-yaml@^5.4.1` under `@nestjs/swagger`, `uuid@^11.1.1` under `exceljs`), checked with the admin build and the API e2e.

## Firebase keys and App Check (security audit #3, finding 8) — owner steps, no code

The Firebase API keys in `apps/mobile/ios/Runner/GoogleService-Info.plist` and `apps/mobile/android/app/src/*/google-services.json` are public by design: every app ships them. What protects the project is where Google accepts them. Do this once per Firebase project (dev, staging, prod):

1. **Restrict the API keys.** Google Cloud Console → APIs & Services → Credentials → open each key named "iOS key" / "Android key (auto created by Firebase)":
   - iOS key: Application restrictions → **iOS apps** → add the bundle IDs (`com.lawbid.lawbid`, plus `.dev` / `.staging` in those projects).
   - Android key: Application restrictions → **Android apps** → add the package name (`com.lawbid.lawbid`, `.dev`, `.staging`) with the **SHA-1** of the signing key. For Play Store builds, take the SHA-1 of the *app signing key* from Play Console → App integrity, and add the upload key's SHA-1 too.
   - API restrictions on both: **Restrict key** → only the APIs the app uses (Firebase Installations, FCM Registration, Firebase Cloud Messaging; add Identity Toolkit only if Firebase Auth is used).
   - The browser key (web push), if there is one: HTTP referrers → the web app's domains only.
2. **Turn on App Check.** Firebase Console → App Check → register the apps: **App Attest** (with DeviceCheck as fallback) for iOS, **Play Integrity** for Android, **reCAPTCHA Enterprise** for the web. First run in *monitor* mode for a week and watch the share of verified requests. Then **Enforce** for Cloud Messaging (and any other Firebase product in use). The app needs the `firebase_app_check` package and one `activate()` call at start-up: that is a small separate code task after the console part.
3. **Check:** a request with the key from another bundle ID / package (for example `curl` to the Installations API) must answer `403 API_KEY_IOS_APP_BLOCKED` / `ANDROID_APP_BLOCKED`.
