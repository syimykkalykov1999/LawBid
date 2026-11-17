# COOP/COEP test — website multi-threading (owner row 173, 2026-11-14)

Question: the Flutter web app (lawbid.dev, `flutter build web --wasm`, skwasm)
runs single-threaded. Flutter draws on a worker thread only when the page is
cross-origin isolated (`window.crossOriginIsolated`: COOP `same-origin` +
COEP `require-corp` or `credentialless`). What breaks, which COEP, and is it
faster?

Everything below was run on the helper Linux laptop (headless Google Chrome
156.0.8078.73, Playwright-core 1.65.1 as a local tool, Flutter 3.47.5 = the
pin, local API + Postgres 16 + Redis 7 in throwaway containers, `seed:perf`
data: one attorney with a 400-message chat). The machine was shared with other
helpers (load average 13–41, written next to every run), so the frame numbers
are relative, not absolute. Nothing here touched production or AWS.

Stand: `scripts/dev/web-coi-test/` (local server with the app's CSP from
`infra/modules/web/main.tf` and four header modes, a second origin for media
and the popup, the probe page and the Playwright scripts).

## Verdict

| | none (today) | COOP same-origin + COEP **credentialless** | COOP same-origin + COEP require-corp | COOP same-origin-allow-popups + COEP credentialless |
|---|---|---|---|---|
| `crossOriginIsolated` / SharedArrayBuffer | false | **true** | true | false (no gain) |
| skwasm render worker (`blob:` worker) | 0 | **1** | — | — |
| own files, API (CORS fetch) | ok | ok | ok | ok |
| image `<img>` other origin, no CORP | ok | **ok** | **blocked** | ok |
| video `<video>` other origin, no CORP | ok | **ok** | **blocked** | ok |
| voice `<audio>` other origin, no CORP | ok | **ok** | **blocked** | ok |
| Google Fonts css + font | ok | ok | ok | ok |
| Cloudflare Turnstile (test site key) | ok | ok | ok | ok |
| Stripe Elements card frame | ok | **blocked** (frames `ERR_BLOCKED_BY_RESPONSE`) | blocked (even `js.stripe.com/v3/`) | blocked |
| sign-in popup that posts back to `window.opener` (Google / Apple popup pattern) | ok | **no message** (opener cut) | no message | ok |
| `window.open` new tab (downloads, `/pay.html`) | opens | opens (handle closed) | opens | opens |

Decision: **COEP `credentialless`**, only on app pages; never on `/pay.html`
(Stripe) or the company site / SEO pages. `require-corp` would break every
cross-origin image, video and voice note without a CORP header. COOP
`same-origin-allow-popups` keeps popups but gives no isolation, so it is
useless here.

What breaks with the switch on, and why it is still safe today:
- **Stripe frames**: the web app does not embed Stripe; it pays on `/pay.html`
  in a new tab (`pay_for_plan.dart`: `kIsWeb` → card page), which the worker
  and CloudFront never isolate, and `pay.js` returns by `location`, not by
  `opener` (checked: no `opener`/`postMessage` in `web/pay.js`).
- **Sign-in popups**: the web app has no Google / Apple sign-in today
  (`socialLogin` in `auth_api_client.dart` has no caller). When it comes, use
  the redirect flow / FedCM, not a popup that talks to `window.opener` —
  or keep this switch off.
- **Safari**: has neither COEP value, stays single-threaded (works as today).

## Frame times: the 400-message chat, scrolled (3 × 40 wheel steps up and down)

`rAF` intervals on the page while scrolling (16.7 ms = every vsync; a value
above 1.5 vsync = a missed frame), plus Long Tasks. `sw` = no server headers,
the admin switch on, isolation by `coi_sw.js`; `cred` = static headers
(the CloudFront variant). Medians of round B (final worker, load 13–17 except
the last sw run at 35):

| mode | isolated | frames > 33 ms | long tasks | long-task time | p90 |
|---|---|---|---|---|---|
| none (today) | no | 119 | 54 | 3 262 ms | 50 ms |
| cred (static headers) | yes | **5** | **4** | **287 ms** | 33 ms |
| sw (admin switch) | yes | **13** | **11** | **796 ms** | 16.7 ms |

So with isolation the long chat drops from ~120 to 5–13 frames over 33 ms in
the same scroll, and the main thread spends ~4–11× less time in long tasks
(the rasterising moved to the skwasm worker). Round A (older worker, higher
machine load 25–41) shows the same: none 113–199 slow frames vs 4–20.

### Round B raw (final `coi_sw.js`)
```
fnone-1 isolated= False sw= None chat= True blobworkers= 0 frames= 777 p50/p90/p99/max= 16.7 50 83.3 133.4 >1.5vsync= 198 >33ms= 148 longtasks= 59 3646 ms {}
load average: 14.89, 17.64, 21.95
fcred-1 isolated= True sw= None chat= True blobworkers= 1 frames= 820 p50/p90/p99/max= 16.67 16.67 33.34 66.7 >1.5vsync= 43 >33ms= 5 longtasks= 4 254 ms {}
load average: 15.47, 17.42, 21.65
fsw-1 isolated= True sw= http://127.0.0.1:8173/coi_sw.js chat= True blobworkers= 1 frames= 816 p50/p90/p99/max= 16.67 16.67 50 116.7 >1.5vsync= 66 >33ms= 13 longtasks= 11 796 ms {'sw_before_reload': ['http://127.0.0.1:8173/coi_sw.js'], 'stored_flag': 'true', 'isolated_before_reload': False}
load average: 17.02, 17.46, 21.44
fnone-2 isolated= False sw= None chat= True blobworkers= 0 frames= 784 p50/p90/p99/max= 16.7 50 66.7 133.4 >1.5vsync= 150 >33ms= 112 longtasks= 29 1894 ms {}
load average: 17.43, 17.45, 21.22
fcred-2 isolated= True sw= None chat= True blobworkers= 1 frames= 851 p50/p90/p99/max= 16.67 33.33 33.34 100 >1.5vsync= 96 >33ms= 3 longtasks= 3 287 ms {}
load average: 16.46, 17.20, 20.94
fsw-2 isolated= True sw= http://127.0.0.1:8173/coi_sw.js chat= True blobworkers= 1 frames= 832 p50/p90/p99/max= 16.67 16.67 33.34 100 >1.5vsync= 83 >33ms= 6 longtasks= 3 241 ms {'sw_before_reload': ['http://127.0.0.1:8173/coi_sw.js'], 'stored_flag': 'true', 'isolated_before_reload': False}
load average: 16.98, 17.18, 20.73
fnone-3 isolated= False sw= None chat= True blobworkers= 0 frames= 773 p50/p90/p99/max= 16.7 50 83.3 133.3 >1.5vsync= 154 >33ms= 119 longtasks= 54 3262 ms {}
load average: 13.20, 16.13, 20.19
fcred-3 isolated= True sw= None chat= True blobworkers= 1 frames= 821 p50/p90/p99/max= 16.67 33.33 50 116.7 >1.5vsync= 101 >33ms= 12 longtasks= 8 571 ms {}
load average: 13.42, 15.72, 19.83
fsw-3 isolated= True sw= http://127.0.0.1:8173/coi_sw.js chat= True blobworkers= 1 frames= 827 p50/p90/p99/max= 16.67 66.67 116.67 533.3 >1.5vsync= 240 >33ms= 191 longtasks= 22 2862 ms {'sw_before_reload': ['http://127.0.0.1:8173/coi_sw.js'], 'stored_flag': 'true', 'isolated_before_reload': False}
load average: 34.97, 20.44, 21.14
```

### Round A raw (first worker version: navigations only)
```
inone-1 isolated= False sw= None chat= True blobworkers= 0 frames= 740 p50/p90/p99/max= 33.3 83.3 133.4 199.9 >1.5vsync= 386 >33ms= 199 longtasks= 133 12259 ms {}
load average: 41.06, 36.88, 31.17
icred-1 isolated= True sw= None chat= True blobworkers= 1 frames= 878 p50/p90/p99/max= 16.67 16.67 33.34 150 >1.5vsync= 79 >33ms= 7 longtasks= 6 526 ms {}
load average: 31.99, 35.12, 30.88
isw-1 isolated= True sw= http://127.0.0.1:8173/coi_sw.js chat= True blobworkers= 1 frames= 823 p50/p90/p99/max= 16.67 33.33 50 116.7 >1.5vsync= 184 >33ms= 20 longtasks= 8 638 ms {'sw_before_reload': ['http://127.0.0.1:8173/coi_sw.js'], 'stored_flag': 'true', 'isolated_before_reload': False}
load average: 30.46, 33.94, 30.71
inone-2 isolated= False sw= None chat= True blobworkers= 0 frames= 760 p50/p90/p99/max= 16.7 66.7 200 1116.6 >1.5vsync= 190 >33ms= 142 longtasks= 126 12808 ms {}
load average: 39.99, 36.40, 31.81
icred-2 isolated= True sw= None chat= True blobworkers= 1 frames= 830 p50/p90/p99/max= 16.67 33.32 33.34 116.7 >1.5vsync= 83 >33ms= 4 longtasks= 3 222 ms {}
load average: 28.33, 33.75, 31.12
isw-2 isolated= True sw= http://127.0.0.1:8173/coi_sw.js chat= True blobworkers= 1 frames= 822 p50/p90/p99/max= 16.67 33.33 99.99 150 >1.5vsync= 118 >33ms= 18 longtasks= 15 1585 ms {'sw_before_reload': ['http://127.0.0.1:8173/coi_sw.js'], 'stored_flag': 'true', 'isolated_before_reload': False}
load average: 25.16, 31.94, 30.66
inone-3 isolated= False sw= None chat= True blobworkers= 0 frames= 773 p50/p90/p99/max= 16.7 50 66.7 100.1 >1.5vsync= 150 >33ms= 113 longtasks= 42 2524 ms {}
load average: 18.16, 29.01, 29.73
icred-3 isolated= True sw= None chat= True blobworkers= 1 frames= 819 p50/p90/p99/max= 16.67 16.67 33.34 100 >1.5vsync= 49 >33ms= 4 longtasks= 3 221 ms {}
load average: 15.02, 26.41, 28.80
isw-3 isolated= True sw= http://127.0.0.1:8173/coi_sw.js chat= True blobworkers= 1 frames= 798 p50/p90/p99/max= 16.67 16.67 33.33 66.7 >1.5vsync= 9 >33ms= 6 longtasks= 6 386 ms {'sw_before_reload': ['http://127.0.0.1:8173/coi_sw.js'], 'stored_flag': 'true', 'isolated_before_reload': False}
load average: 13.99, 24.56, 28.06
```

Console during these runs (every mode, including `none`): `Null check
operator used on a null value` + `Another exception was thrown` on the chat
screen, and `drift_worker.js net::ERR_ABORTED` — the same with and without
isolation, so not caused by it (an existing chat-screen bug, reported to the
foreman, not fixed here). The sw runs also show Flutter's "Skwasm … will run in
single-threaded mode" warning: that is the first page load, before the worker
is registered (by design, the next load is isolated). Run fsw-3 logged one
`pageerror: Exception` under load 35; it did not repeat in 5 other sw runs.

## Third-party probe (raw)

`probe-run.mjs`: the same page under each header mode; media from a second
origin without `Cross-Origin-Resource-Policy` (`?corp` = with it), a CORS
fetch, Google Fonts, Turnstile test site key `1x00000000000000000000AA`,
Stripe Elements with Stripe's public docs test key, and a popup on another
origin that posts `{signedIn:true}` to its opener.

```
chrome 156.0.8078.73
{"mode":"none","isolated":false,"sab":false,"font_css":"ok","fetch_cors":"ok","img_nocors_nocorp":"ok","img_nocors_corp":"ok","video_nocors_nocorp":"ok","video_nocors_corp":"ok","audio_nocors_nocorp":"ok","popup_handle":"window","popup_message":"ok","turnstile":"ok","popup_closed_seen":true,"stripe_card":"ok","frames":11}
  console/net: Failed to load resource: the server responded with a status of 404 (Not Found)
  console/net: requestfailed https://api.hcaptcha.com/getcaptcha/20000000-ffff-ffff-ffff-000000000002 net::ERR_NETWORK_CHANGED
  console/net: Failed to load resource: net::ERR_NETWORK_CHANGED
  console/net: requestfailed https://r.stripe.com/b net::ERR_NETWORK_CHANGED
  console/net: requestfailed https://0e61d1452de1.w.hcaptcha.com/logo.png net::ERR_ABORTED
{"mode":"credentialless","isolated":true,"sab":true,"font_css":"ok","fetch_cors":"ok","img_nocors_nocorp":"ok","img_nocors_corp":"ok","video_nocors_nocorp":"ok","video_nocors_corp":"ok","audio_nocors_nocorp":"ok","popup_handle":"window","turnstile":"ok","popup_closed_seen":true,"frames":5}
  console/net: requestfailed https://js.stripe.com/v3/controller-with-preconnect-aaa82383600f40249fd1931c20e2df23.html net::ERR_BLOCKED_BY_RESPONSE
  console/net: requestfailed https://js.stripe.com/v3/elements-inner-card-b9b4dfa8ad514b85e53baa197a6d5994.html net::ERR_BLOCKED_BY_RESPONSE
  console/net: Failed to load resource: the server responded with a status of 404 (Not Found)
  console/net: requestfailed https://js.stripe.com/v3/m-outer-0edadf75b42c6ef7240c043f3272f3f9.html net::ERR_BLOCKED_BY_RESPONSE
{"mode":"require-corp","isolated":true,"sab":true,"stripe_card":"no script: ReferenceError: Stripe is not defined","font_css":"ok","fetch_cors":"ok","img_nocors_nocorp":"blocked","img_nocors_corp":"ok","video_nocors_nocorp":"blocked","audio_nocors_nocorp":"blocked","video_nocors_corp":"ok","popup_handle":"window","turnstile":"ok","popup_closed_seen":true,"frames":2}
  console/net: requestfailed https://js.stripe.com/v3/ net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  console/net: Failed to load resource: net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  console/net: requestfailed http://127.0.0.1:8179/img.png net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  console/net: requestfailed http://127.0.0.1:8179/clip.webm net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  console/net: requestfailed http://127.0.0.1:8179/voice.wav net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  console/net: Failed to load resource: the server responded with a status of 404 (Not Found)
{"mode":"allow-popups+credentialless","isolated":false,"sab":false,"font_css":"ok","fetch_cors":"ok","img_nocors_corp":"ok","img_nocors_nocorp":"ok","video_nocors_corp":"ok","video_nocors_nocorp":"ok","audio_nocors_nocorp":"ok","popup_handle":"window","popup_message":"ok","turnstile":"ok","popup_closed_seen":true,"frames":5}
  console/net: requestfailed https://js.stripe.com/v3/elements-inner-card-b9b4dfa8ad514b85e53baa197a6d5994.html net::ERR_BLOCKED_BY_RESPONSE
  console/net: requestfailed https://js.stripe.com/v3/controller-with-preconnect-aaa82383600f40249fd1931c20e2df23.html net::ERR_BLOCKED_BY_RESPONSE
  console/net: Failed to load resource: the server responded with a status of 404 (Not Found)
  console/net: requestfailed https://js.stripe.com/v3/m-outer-0edadf75b42c6ef7240c043f3272f3f9.html net::ERR_BLOCKED_BY_RESPONSE
```
(`mode: none` shows `stripe_card: ok`; a missing `stripe_card` = the card
frame never became ready; `popup_closed_seen: true` in every mode is the popup
closing itself after 300 ms. MP4 in the first run was an mpeg4-part-2 file
the local ffmpeg made (no libx264), so the probe uses WebM.)

## The admin switch, end to end (`sw-onoff.mjs`)

Admin switch on → the app stores it (`WebIsolation`) and calls
`window.__lbCoi(true)` → `boot_head.js` registers `/coi_sw.js` → the next
load is isolated. Off → the worker is told "off" and removed by the first page
that is not isolated. No worker script was blocked in any step (`blocked`):

```
ON  load1 (first visit) {"isolated":false,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":1,"flag":"true","blocked":[]}
ON  load2 {"isolated":true,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":1,"flag":"true","blocked":[]}
ON  /pay.html {"isolated":false,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":1,"flag":"true","blocked":[]}
ON  /about/ {"isolated":false,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":1,"flag":"true","blocked":[]}
ON  /feed (app screen) {"isolated":true,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":1,"flag":"true","blocked":[]}
OFF load3 (still served by the worker, app hears off) {"isolated":true,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":1,"flag":"false","blocked":[]}
OFF load4 {"isolated":false,"controller":"http://127.0.0.1:8173/coi_sw.js","regs":0,"flag":"false","blocked":[]}
console errors: ["Failed to load resource: the server responded with a status of 404 (Not Found)"]
```
(The 404 is `/favicon.ico` of pages without an icon link on the local server;
the same without the worker.)

## Causes found and fixed on the way (each proven first)

1. **Flutter's own template would delete our worker.** The generated
   `flutter_bootstrap.js` passes `serviceWorkerSettings`; Flutter 3.47.5's
   `flutter.js` then calls `getRegistration()` and, if any worker controls `/`,
   registers `flutter_service_worker.js` over it, which unregisters itself.
   Fix: `web/flutter_bootstrap.js` template with `_flutter.loader.load({})`;
   the deploy now fails if `serviceWorkerSettings` is ever back.
2. **Worker scripts of an isolated page need COEP themselves.** First worker
   version (navigations only): `drift_worker.js net::ERR_BLOCKED_BY_RESPONSE`
   in every sw run of round A, reproduced alone (`new Worker('/drift_worker.js')`
   from an isolated page: error; same with static headers: ok). Fix: the worker
   adds COEP to same-origin `worker` / `sharedworker` scripts.
3. **Turning off must not strand an isolated page.** Removing the worker from
   a page that is still isolated made Chrome stop serving that page's worker
   scripts through it (blocked again for one load). Fix: "off" is a message
   (kept in Cache Storage); the next navigation is not isolated, and that page
   removes the worker.

## What ships (PR)

- Admin switch `web.cross_origin_isolation` (Выкл by default; admin → Config,
  Russian label), in the public bootstrap, `SWITCH_INVENTORY.md` row.
- `apps/mobile/web/coi_sw.js` + `boot_head.js` block + `WebIsolation`
  (`core/platform/web_isolation*.dart`).
- Build flag: repository variable `WEB_SKWASM_THREADS` = `auto` (default) |
  `single` (`forceSingleThreadedSkwasm`, written into the loader config by
  `scripts/deploy/web-immutable.py`): one thread even on an isolated page,
  a kill switch through a redeploy. (`flutter build web -h` of 3.47.5 has no
  thread flag; the loader decides at run time.)
- Infra: **code only, not applied** — only the description of the existing
  Terraform variable `cross_origin_isolation` (keep it off; with it on the
  admin switch can no longer take the headers away).

## Owner steps

1. Merge; the next web deploy ships `coi_sw.js` (nothing changes while the
   switch is off).
2. To try it: admin → Config → «Сайт: многопоточная отрисовка» → Вкл. Open
   lawbid.dev twice; in DevTools `crossOriginIsolated` is `true` on the second
   load. Scroll a long chat. Off again any time: two page loads later the site
   is as today.
3. Not verified here: real Bunny / R2 media hosts (the probe used a local
   origin without CORP — `credentialless` loaded it), FCM push and passkeys on
   the real host, Firefox (Chrome only on this machine).
