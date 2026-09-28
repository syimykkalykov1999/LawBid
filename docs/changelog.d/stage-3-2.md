## Stage 3.2: file uploads — presign, confirm, antivirus, HEIC, avatars — 2026-09-27

docs/03 §11 stage 3.2, §2.2, §4.1 (photo), §9 (`files.max_size_mb`,
`files.avatar_max_size_mb`, `verification.signed_url_ttl_sec`); docs/02 §1.6 +
§4.A `files`; OQ-012 (attorney photo API now, mobile step in 3.9). No schema
change.

**API — `apps/api/src/modules/files`**
- `POST /files/presign` (Idempotency-Key): `{purpose, mime, sizeBytes, sha256}`.
  Per-purpose allow-list (avatar / post_image / verification_selfie: JPEG, PNG,
  HEIC; verification_document: + PDF) and size limit from app_config (avatar
  5 MB, others 10 MB). Per-user limit (env `FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR`,
  60) + CostGuard provider `storage` (`budget.storage.*`, seeded 120/5000/100000).
  Returns an S3 POST policy (5 min) that accepts only exactly the declared size
  and Content-Type at one key `<purpose>/<userId>/<fileId>`; buckets: documents
  (verification) / media (avatar, posts). The intent waits in Redis (1 h).
- `POST /files/:id/confirm`: server reads the object back — size, SHA-256 and
  real type by magic bytes (JPEG/PNG/PDF/HEIC; AVIF and anything else refused);
  a mismatch deletes the object (`FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`,
  `FILE_CHECKSUM_MISMATCH`); not yet uploaded → `FILE_NOT_UPLOADED`. Success
  creates the `files` row (`scan_status=pending`) and queues the scan. Retry-safe.
- `GET /files/:id`: owner only (others 404); `url` = signed link only for clean
  avatar/post images, never for verification files.
- Scan worker: BullMQ queue `files` (in the API while JOBS_ENABLED, always in
  `src/worker.ts`), 3 attempts. `VirusScanner` interface: `ClamdScanner`
  (clamd `zINSTREAM` over TCP) when `CLAMAV_HOST` is set; otherwise
  development/test use `DevEicarScanner` (flags only the EICAR test string);
  **staging/production without `CLAMAV_HOST` have no scanner — files stay
  `pending` and can never be attached (production must set `CLAMAV_HOST`).**
  infected → object deleted, row `infected`; scanner/S3 failure on the last
  attempt or an undecodable image → `failed`.
- Processing (sharp; HEIC decoded by libheif-WASM `heic-decode`, since prebuilt
  sharp has no HEVC): HEIC → JPEG for every purpose; avatar → EXIF orientation
  applied, square centre crop 1024 px JPEG + `<key>_w256` variant, all
  metadata stripped. Row's mime/size/sha256/width/height describe the stored
  object; the row turns `clean` only after processing.
- `FilesService.assertAttachable(user, file, purposes)` — the only way other
  modules reference a file (owner + purpose + `clean`), `mediaUrl()`,
  `verificationFileUrl()` (TTL `verification.signed_url_ttl_sec`; for the
  verifier API of stage 3.4, which must check the role and write audit_log).
- `PATCH /users/me` accepts `avatarFileId` (uuid | null; clean own avatar only,
  else `FILE_NOT_ATTACHABLE`/404); `GET /users/me` returns `avatarFileId`,
  `avatarUrl` (signed, 1 h).
- Dev/test boot creates missing MinIO buckets (private, no policy);
  staging/prod never do.
- New ErrorCodes: FILE_TYPE_NOT_ALLOWED, FILE_TOO_LARGE, FILE_CHECKSUM_MISMATCH,
  FILE_NOT_UPLOADED, FILE_NOT_ATTACHABLE, FILE_STORAGE_UNAVAILABLE (mobile
  ApiErrorCodes + en/ru texts; keys in `prisma/seed/pending_keys/stage-3-2.csv`).
- Env: `CLAMAV_HOST`, `CLAMAV_PORT`, `FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR`,
  `BUDGET_STORAGE_*`. Deps: @aws-sdk/client-s3, s3-presigned-post,
  s3-request-presigner, sharp, heic-decode.
- Contract regenerated (`FilesClient`, `FileDto`, `MeDto.avatarFileId/avatarUrl`).

**Tests**: unit (magic bytes, scanners incl. a fake clamd, image processing,
FilesService, scan processor); e2e `test/files.e2e-spec.ts` against MinIO —
PNG declared as PDF rejected + deleted, oversize/declared-type refusals, S3
refuses wrong size/Content-Type, checksum mismatch, EICAR → infected + deleted +
not attachable (also as avatar), avatar pipeline, HEIC selfie → JPEG, foreign
file 404, unsigned GET of a key → 403 on both buckets, signed link (TTL 2 s)
200 then 403. e2e uses per-tag buckets `lawbid-e2e-<tag>-*`; MinIO credentials
default to docker-compose.yml (override `S3_SECRET_ACCESS_KEY` if your MinIO
differs).

**Not in this stage**: post photo variants 320/1080 + CloudFront (docs/05 §3.2);
cleanup of presigned-but-never-confirmed objects (S3 lifecycle rule, docs/06
infra); re-queue of `pending` files once a scanner is configured; deleting the
previous avatar object on replacement.
