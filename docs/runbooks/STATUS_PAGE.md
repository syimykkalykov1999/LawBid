# Страница статуса для пользователей (status.lawbid.dev)

## Коротко для владельца

Это отдельная страница, где любой человек видит: приложение, чаты, звонки,
платежи, уведомления работают или нет. Она **не зависит от нашего сервера**:
лежит в S3 + CloudFront, поэтому открывается, даже когда сервер упал. Рабочий
сервер каждую минуту кладёт туда свежий файл. Если файл перестал обновляться
(упало всё), страница сама пишет «данные могут быть устаревшими».

Выключено по умолчанию. Чтобы включить, нужны два шага (ниже). Сообщение о
сбое или плановых работах: админка → Система → «Страница статуса» (через API
`/admin/status-page`, см. ниже).

### Шаги владельца

1. В `infra/envs/prod/terraform.tfvars`:
   ```
   status_page_enabled       = true
   status_host               = "status.lawbid.dev"
   status_create_certificate = true
   ```
   `terraform apply -target=module.stack.module.status_page.aws_acm_certificate.status`
   (сертификат), добавить DNS-запись из вывода `status_page_validation_records`,
   потом полный `terraform apply`. Без `status_host` страница откроется по
   адресу CloudFront (`status_page_dns_target`): так можно проверить заранее.
2. DNS-запись `status` → значение `status_page_dns_target` (вид `dxxxx.cloudfront.net`):
   - **Сейчас (Namecheap)**: Advanced DNS → Add record → CNAME, Host `status`.
   - **Позже (Cloudflare)**: DNS → Add record → CNAME, Name `status`, Target то
     же значение, облачко **серое (DNS only)**, как у остальных записей из
     `DNS_TO_CLOUDFLARE.md`. Оранжевое не включать: сертификат CloudFront
     проверяется напрямую.
   - Если зона в Route 53 (`hosted_zone_id`), запись создаёт сам terraform.

После `apply` сервер (задача worker) сам получает имя бакета (`STATUS_PAGE_BUCKET`)
и права на запись одного файла `status.json`; через минуту страница показывает
живые данные.

## Technical

- Data: worker job `ops.status-watchdog` (every minute) reuses the probes it
  already computed and calls `PublicStatusService.publish` (apps/api
  `src/common/ops/status/public-status.service.ts`), which writes `status.json`
  to `STATUS_PAGE_BUCKET`. Empty bucket = nothing published, no behaviour change.
- Mapping (public-status.ts): app = http, database, worker; chats = redis,
  realtime; calls = cloudflare_turn, cloudflare_sfu; payments = stripe_webhooks;
  notifications = push, queues. One red probe = "degraded"; "outage" only when
  the watchdog has an open incident (two bad checks in a row). Admin incidents
  override upward. No internal detail leaves the API.
- Admin incidents: super_admin only, audited. Stored in `system_incidents`
  (`detail.manual = true`, severity `degraded` / `outage` / `maint`; the
  existing one-open-row-per-component index applies, so one open incident per
  public component).
  - `GET  /admin/status-page`
  - `POST /admin/status-page/incidents` `{component, kind, titleRu, titleEn?, messageRu?, messageEn?}`
  - `POST /admin/status-page/incidents/:id/resolve`
  Each change republishes at once.
- Page: `apps/status-page/index.html` (one file, RU/EN, no dependencies),
  uploaded by terraform (`aws_s3_object`, re-apply after editing it). Treats
  `status.json` older than 6 minutes as stale.
- Infra: `infra/modules/status-page` (private S3 + OAC, CloudFront, 30 s cache
  for status.json, security headers, optional ACM + Route 53). Cost: cents/month.
- Limit: if the whole worker is down the file stops updating; the page then
  shows "unknown" after 6 minutes. For an independent outside check, add an
  external pinger (Upptime or UptimeRobot free) later; not required for this
  design.

### Why this and not a ready-made tool

Researched 2026-10-25: Upptime (GitHub Actions + Pages; a 2026 comparison says
its last major release was 2020), Gatus (needs a container), cState (Hugo static
generator) all produce their own checks and pages. We already have probes,
incidents and on-call alerts, so we only needed a static viewer on independent
hosting. Sources: OneUptime, "Self-Hosted Status Pages Compared: Cachet, Upptime,
Gatus, cState, and OneUptime" (2026-04-14, vendor blog):
https://oneuptime.com/blog/post/2026-04-14-self-hosted-status-page-comparison/markdown ;
OpenStatus, "Best Open Source Status Page Tools in 2026" (vendor blog):
https://www.openstatus.dev/guides/best-opensource-status-page-2026
