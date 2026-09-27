## p12 leaf-1.3: API contract — typed OpenAPI, generated Dart client, one ErrorCode — 2026-09-27

docs/01 §6.3 (packages/api-contract: OpenAPI-generated Dart client, never
hand-edited, regenerated after any endpoint change), §7 (envelope + error
format, one ErrorCode enum on server and client), §16 DoD ("Swagger покрывает
все эндпоинты, Dart-клиент сгенерирован из него").

**API (documentation only unless noted)**
- Response DTOs for every endpoint's `data` (`auth-responses.dto.ts`,
  `user-responses.dto.ts`, `i18n-responses.dto.ts`,
  `bootstrap-response.dto.ts`); controllers declare them as return types, so
  tsc checks the documented shape against what the services return.
- `ApiEnvelopeResponse(Dto, {status, isArray})` documents the global envelope
  as named `XxxEnvelope = {data, meta?: {nextCursor}}` schemas;
  `ApiErrors({status: [codes]})` documents `ErrorResponseDto` with the shared
  `ErrorCode` enum schema (`common/dto/api-docs.decorators.ts`).
- OpenAPI document: paths without the `/api/v1` prefix (server URL
  `/api/v1`; `/health/*` override per operation), operationId = handler
  method name (duplicates fail the build), one tag per controller, header
  params `Idempotency-Key` / `X-Reauth-Token` / `x-device-attestation` /
  `If-None-Match` where the routes read them, multipart body for
  `POST /admin/i18n/import`, binary xlsx 200 for `GET /admin/i18n/export`,
  304 for the i18n bundle.
- Handler renames (no route change): `I18nAdminController.import/export` →
  `importTranslations/exportTranslations`, `CasesController.create` →
  `createCase`.
- Runtime fixes found on the way:
  - AllExceptionsFilter turned EVERY `BadRequestException` into
    `VALIDATION_ERROR`, swallowing feature codes thrown that way
    (`I18N_IMPORT_INVALID` with `details.errors`, `I18N_LANGUAGE_NOT_FOUND`
    from PATCH /users/me). A 400 that carries its own `code` now keeps it;
    ValidationPipe's code-less 400s are unchanged.
  - `POST /users/me/role`, `/onboarding/complete`, `/consents` and
    `/contacts/request` now apply `IdempotencyInterceptor`: the app already
    sent an `Idempotency-Key` for them, but the server ignored it, so a
    retried contacts/request could send a second paid SMS/email.

**packages/api-contract**
- `generate.sh`: exports `openapi.json`, then generates the Dart package
  `lawbid_api` (`dart/`) with swagger_parser 1.45.0 (retrofit clients +
  json_serializable models) + build_runner, then `dart format`. Toolchain
  pinned (pubspec exact versions + committed pubspec.lock); regeneration is
  byte-identical. Generated `*.g.dart` are committed (package `.gitignore`
  overrides the repo-wide ignore). `build.yaml`: unset optional request
  fields are omitted, never sent as null.
- CI: api-ci "API contract is up to date" step runs `generate.sh` and fails
  on any diff/untracked file, then `dart analyze --fatal-warnings`; api-ci
  and mobile-ci also trigger on `packages/api-contract/**`.

**Mobile**
- `lawbid_api` path dependency. `AuthApiClient` and `UsersApiClient` now run
  on the generated `AuthClient`/`UsersClient` with the app's own Dio (all
  interceptors kept; `skipAuth`/`createsResource` passed as retrofit
  extras); request bodies are the generated DTOs, responses the generated
  envelopes. `DeviceInfo`/`AuthTokensResult` are aliases of the generated
  models; `CurrentUserMapper` maps `MeDto` → `CurrentUser` (unknown enum
  values dropped, as before). `guardApiCall` maps DioException → ApiException
  and an off-contract 2xx body → NETWORK_ERROR. The profile step keeps a raw
  PATCH for its body (explicit `contactMethod: null` clears the method; the
  generated models omit nulls) and parses the response as `MeEnvelope`.
- `ApiErrorCodes` lists all 38 server codes (+ `all`); a test compares it
  with the generated `ErrorCode` enum. New localized texts (en+ru) for
  DEVICE_ATTESTATION_REQUIRED, AUTH_REFRESH_REUSE_DETECTED,
  AUTH_SESSION_REVOKED (also used for AUTH_REFRESH_EXPIRED/INVALID),
  IDEMPOTENCY_KEY_CONFLICT, FORBIDDEN, NOT_FOUND, NOT_IMPLEMENTED; social
  token/provider codes reuse the existing `auth.social.error.*` texts. Keys:
  apps/api/prisma/seed/pending_keys/leaf-1.3.csv.
