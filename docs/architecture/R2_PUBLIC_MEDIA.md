# Public media on Cloudflare R2

Status: designed and implemented behind an admin switch (default OFF).
Owner decision 2026-10-24: public media moves to R2 (zero egress fees).
Private content stays on AWS exactly as today.

## Резюме по-русски

- Что: публичные фото (аватары, фото постов и отзывов, стикеры) можно хранить в Cloudflare R2. У R2 нет платы за исходящий трафик, поэтому раздача фото дешевле, чем с S3/CloudFront.
- Что НЕ меняется: чаты (фото, голос, файлы), файлы дел, документы, документы верификации остаются на AWS (KMS, Macie, подписанные ссылки CloudFront). Код устроен так, что приватный тип файла физически не может попасть в R2 (есть тест).
- Видео и рилсы идут через Bunny Stream, как и раньше; R2 их не касается.
- Включение: Админка -> Интеграции -> «Cloudflare R2» (5 полей) -> Настройки -> `media.public_store` = `r2`. По умолчанию `aws`, пока не включите — ничего не меняется.
- Старые посты продолжают грузиться: у каждого файла в базе записано имя бакета, по нему система сама понимает, где лежит файл (AWS или R2).
- Откат: вернуть `media.public_store` = `aws`. Новые файлы пойдут в AWS, уже загруженные в R2 останутся доступными.
- Раздача: публичный бакет R2 на своём домене (например `media.lawbid.dev`) за кэшем Cloudflare. Для этого домен `lawbid.dev` должен быть в Cloudflare (сейчас DNS в Namecheap — надо сменить NS; все существующие записи переносятся как есть, без «оранжевого облака»).
- Старые приложения (без поддержки PUT) при включённом R2 продолжают загружать фото в AWS: сервер выдаёт R2-загрузку только тем, кто сообщил, что умеет PUT.

## Verified facts (developers.cloudflare.com/r2, checked 2026-10-24)

| Topic | Fact | Consequence |
|---|---|---|
| S3 API | PutObject, GetObject, HeadObject, DeleteObjects, CopyObject, multipart: supported. | Same AWS SDK v3 client works with `endpoint=https://<account>.r2.cloudflarestorage.com`, `region=auto`. |
| Presigned POST | NOT supported. Presigned URLs are GET/HEAD/PUT/DELETE only. | Our `createPresignedPost` cannot be used. R2 uploads use presigned PUT. |
| Presigned signed headers | Content-Type can be signed; a different Content-Type gives 403 SignatureDoesNotMatch. Max expiry 7 days. Content-Length is not documented as enforced. | Sign Content-Type, Cache-Control and Content-Length; do NOT rely on Content-Length alone (see Size limits). |
| Presigned + custom domain | Presigned URLs work only on the S3 API host, not on custom domains. | Uploads go to the S3 endpoint; reads go to the custom domain. |
| Tagging, ACL, SSE headers | Not supported (SSE-C only). | We never use them on media (bucket is public by design). Private data stays on AWS where KMS applies. |
| Public access | `r2.dev` URL is rate-limited, no cache, dev only. A custom domain gets Cloudflare cache and WAF. The domain must be a zone in the same Cloudflare account (partial CNAME setup is possible but a paid plan). | Use a custom domain. |
| Pricing | Storage $0.015/GB-month, Class A (writes) $4.50/M, Class B (reads) $0.36/M, egress free; free tier 10 GB, 1M A, 10M B. Cache hits at the edge are not billed as R2 reads. | Serving through the cache is cheapest. |

## Media kinds: public or private

Rule in code: `PURPOSE_RULES[purpose].bucket`. `media` = public (R2-eligible), `documents` = private (AWS only, forever).

| Kind (FilePurpose / flow) | Bucket | Public? | Store |
|---|---|---|---|
| avatar | media | public | R2 when switch on |
| post_image (feed photos) | media | public | R2 when switch on |
| review_photo | media | public | R2 when switch on |
| sticker | media | public | R2 when switch on |
| post_video (flag-gated, no MIME accepted today) | media | public | R2 when switch on |
| Starter sticker catalog, demo seed images | media | public | R2 when switch on (server `put`) |
| case_photo, case_attachment | documents | PRIVATE | AWS only |
| chat_attachment, chat_voice, support_attachment | documents | PRIVATE | AWS only |
| task_attachment, post_attachment, document_template | documents | PRIVATE | AWS only |
| verification_document, verification_selfie | documents | PRIVATE | AWS only |
| data_export, legal exports, case-history export | documents | PRIVATE | AWS only |
| Reels / feed videos (Bunny Stream) | Bunny | public | Bunny, unchanged |
| Reel thumbnails | Bunny | public | Bunny, unchanged |

Image variants (`<key>_w256`, `_w320`, `_w1080`) are stored next to the main object in the same bucket, so they follow the object.

## How routing works (the key idea)

Every `File` row already stores `s3_bucket` + `s3_key`. All reads, deletes, scans and moderation use that pair. So the storage service picks the backend **by bucket name**:

- bucket name == the configured R2 bucket -> R2 client
- anything else -> AWS client

Consequences: old posts keep loading from AWS after the switch; objects in R2 keep loading after a rollback; no database migration; every existing call site (scan, moderation, delete, GDPR erase, retention, orphan cleanup) works for R2 objects without changes.

Where new objects go is decided only by `bucket(kind)`:
- `documents` -> always the AWS documents bucket (the R2 branch does not exist for it).
- `media` -> R2 bucket only if `media.public_store = r2` AND R2 is configured AND (for browser/app uploads) the client said it can do PUT; else AWS media bucket.

Hard guards (all tested):
1. `bucket('documents')` can never return the R2 bucket.
2. The R2 bucket name must differ from both AWS bucket names, otherwise R2 is ignored.
3. `copyForUser` from a private file into a public purpose keeps the copy on AWS (private bytes are never copied to R2 by this path).
4. Presigned PUT is only issued for the R2 bucket; private purposes go through the unchanged presigned POST.

## Upload (presigned PUT) and size limits

`POST /files/presign` accepts a new optional `supportsPut: true`. When the file goes to R2 the response is additive:
`upload = { url, fields: {}, method: 'PUT', headers: { 'Content-Type': ..., 'Cache-Control': ... } }`. AWS responses are unchanged (`method` defaults to POST for old clients).

The app sends the file as the raw request body with exactly those headers, then calls `POST /files/:id/confirm` as before.

How limits stay enforced (S3 POST policy had `content-length-range`; PUT has no such policy):
1. Server checks declared `sizeBytes` against the purpose limit before issuing a link (unchanged).
2. The link signs `Content-Type`, `Cache-Control` and `Content-Length` (declared size). A different Content-Type fails the signature.
3. Authoritative check at confirm (already exists): `HeadObject` size must equal the declared size and be below the limit, then the full bytes are read and the SHA-256 and magic-byte type must match. A mismatch deletes the object and rejects the upload.
4. Objects never confirmed are removed by the existing pending-upload cleanup (`PENDING_UPLOADS_KEY`), which routes by bucket name.
5. Residual risk: within the 5-minute link life a client could upload a larger body if R2 ignores the signed length; it is deleted at confirm or by the sweep and costs only cents of storage (no egress charge on R2). Rate limits and the cost guard still apply per presign.

Browser uploads (Flutter web) need a CORS rule on the R2 bucket allowing PUT from the app origins with `Content-Type`, `Cache-Control` headers.

## Scan and moderation

- ClamAV scan + image processing (`FileScanProcessor`) uses `storage.read(bucket,key)`, `put`, `remove`: all routed, so R2 objects are scanned, resized, given variants, and infected files are deleted from R2.
- Rekognition moderation already sends image **Bytes** (never an S3Object reference), read through `storage.read`, so R2 needs no change.
- Order is unchanged: upload -> confirm (checks) -> scan -> variants -> moderation. Until `scan_status = clean` the API gives no URL, so an unscanned R2 object is never linked. (The object is publicly fetchable only by someone who knows the unguessable key.)

## Serving: recommendation

Recommended: **R2 public bucket on a custom domain behind Cloudflare cache** (for example `media.lawbid.dev`).

Why not presigned GETs from R2: a presigned URL changes on every request, so the browser and edge cannot cache it, every view is a billed Class B read and the app's "keep by unsigned URL for a year" optimisation is lost. Public custom domain gives cache hits, which are free.

Requirements: `lawbid.dev` becomes a Cloudflare zone (change nameservers at Namecheap; recreate the existing DNS records first, all "DNS only"/grey cloud so API, admin and mail keep working exactly as now). If the owner does not want to move the main domain, register a separate cheap domain just for media and put that on Cloudflare.

- Unguessable keys: `<purpose>/<userId>/<random UUID v4 fileId>`; 122 bits of randomness, bucket listing is not public. A new file is a new key, so bytes behind a URL never change (immutable cache header, as today).
- Cache rule: Cache Everything for the media hostname, Edge TTL 1 day (overrides the origin's one-year header at the edge; browsers still keep it a year).
- WAF/hotlink rules can be added later on the same hostname.

### Deletion and blocking

- The API stops returning a URL for deleted, non-clean or moderated-hidden files (`mediaUrlOf`), so removed/blocked content disappears from the app immediately.
- Hard delete (infected, erase, GDPR, retention): object removed from R2. The edge copy can live up to the edge TTL (1 day). To make it immediate, fill the optional fields `zoneId` + `purgeToken` (token with only "Cache Purge") in the integration: the API then purges the exact URLs right after each delete (best effort, failure only logged). Without them, expect up to 24 h at the edge, and the unguessable key limits exposure.
- Same as today's CloudFront setup (one-year immutable): this is no weaker than before.

## Migration of existing public objects

Script: `apps/api/scripts/migrate-public-media-to-r2.ts` (dry-run by default).

1. Lists `File` rows of public purposes whose `s3_bucket` is the AWS media bucket and which are not deleted.
2. For each distinct key (rows share keys when deduplicated) copies main + `_w256/_w320/_w1080` to R2 (same key, content type, cache-control), verifies size by HEAD.
3. With `--apply` it then switches the rows to `s3_bucket = <R2 bucket>`. AWS originals are NOT deleted (`--delete-source` is a separate later pass after a soak period).
4. Resumable and idempotent (already copied keys are skipped).

Order for the owner: create R2 -> configure integration -> run the script in dry-run, then `--apply` -> turn `media.public_store` to `r2` (new uploads) -> after some days `--delete-source`.

### Rollback

1. Set `media.public_store = aws` (new uploads go to AWS again, takes effect within ~30 s).
2. Old R2 objects keep working as long as the integration stays configured.
3. To move rows back: `migrate-public-media-to-r2.ts --rollback --apply` points rows to the AWS bucket again (works while AWS originals still exist, i.e. before `--delete-source`).

## Deletion, retention, GDPR

`FileReleaseService`, storage cleanup, orphan sweep, account deletion and GDPR erase all call `storage.remove(bucket, keys)`; routing by bucket name makes them delete from R2 for R2 rows. Unchanged and tested for R2.

## What is NOT covered

Bunny video, reel covers: unchanged. Mobile local caches: unchanged. CloudFront/Macie for the media bucket: unchanged for objects still on AWS.
