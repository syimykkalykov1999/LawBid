# Web version — what is built and what the owner still has to do

The web app is the same Flutter app built for the browser (WebAssembly).
Everything below is **code in the repository**; nothing is applied to AWS
and nothing is public until the owner's steps at the end.

## What is where

| Part | Where |
|---|---|
| App (adaptive shell: side menu, centred column, sheets over the column) | `apps/mobile` (`lib/core/navigation/shell/`) |
| First-visit notice (analytics consent + privacy policy) | `apps/mobile/lib/core/platform/web_consent_notice.dart` |
| Browser file/receipt download, path URLs (`/lawyer/anna`) | `lib/core/platform/web_download*.dart`, `run_app.dart` |
| Browser push (off until the Firebase web keys are given) | `lib/features/notifications/application/push_service.dart`, `web/firebase-messaging-sw.js`, token platform `web` in the API |
| Hosting: S3 + CloudFront, security headers, SPA fallback | `infra/modules/web` (composed in `infra/modules/stack`) |
| Publishing the app | `.github/workflows/web-deploy.yml` |
| Public search pages (practice area × state, attorney profiles, sitemap) | `scripts/seo/` + `.github/workflows/seo-deploy.yml`; data from `GET /api/v1/public/directory/attorneys` |

## Owner's list (in this order)

1. **Firebase web app + VAPID key** (push in the browser): Firebase console →
   project `lawbid-6e5ff` → Add app → Web; then Project settings → Cloud
   Messaging → Web Push certificates → Generate key pair. Give: `apiKey`,
   `appId`, `messagingSenderId`, `projectId`, `authDomain`, the VAPID key.
   They go into the repository secrets `FIREBASE_WEB_*` (see
   `web-deploy.yml`). Without them the web simply has no push.
2. **AWS** (same account and Terraform state as the rest): an ACM
   certificate for the web host in **us-east-1** (CloudFront reads only that
   region), then in `terraform.tfvars`: `web_host`, `web_certificate_arn`;
   `terraform apply`. Point the DNS record at the CloudFront domain if the
   zone is not in Route 53.
3. **Repository secrets/variables** for the two workflows: variable
   `WEB_DEPLOY_ENABLED=true`; secrets `WEB_BUCKET`, `WEB_DISTRIBUTION_ID`
   (terraform outputs), `WEB_API_BASE_URL`, `WEB_DEEP_LINK_HOST`,
   `WEB_SITE_URL`, `WEB_SEO_API_URL`, and the deploy role needs the
   `web_deploy_policy_arn` policy.
4. **API CORS**: add the web origin to `S3_CORS_ALLOWED_ORIGINS`
   (`s3_cors_allowed_origins` in tfvars) and the API's allowed origins.
5. **Search engines**: after the first publish, add the site in Google Search
   Console and submit `https://<host>/sitemap.xml`. By default only pages with
   attorneys and the high-demand states are indexed (the rest are
   `noindex`, to avoid thin pages); run the `SEO pages` workflow with
   *index_empty* to index every page.
6. **By ear on a real phone** (cannot be proven on the emulator): that a
   voice message is heard, and that both sides hear each other in an audio
   and a video call. The emulator needs macOS microphone permission for the
   emulator before it records anything but silence.
7. Then: the store builds (mobile), as agreed.

## Decisions taken without asking (change if wrong)

- The notice says what the app's own consent says (anonymous analytics) and
  has a single choice that matters: statistics on or off.
- Search pages never show cases or clients; attorneys only appear if verified
  and active. A page with no attorneys says so and invites a case; no
  attorney is invented.
- Payments on the web open the same Stripe pages as the app (new tab), only
  when the app's own flag allows it.
