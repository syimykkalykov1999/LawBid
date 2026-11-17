/* Owner row 173 (2026-11-14): cross-origin isolation of the website behind
   the admin switch `web.cross_origin_isolation` (off by default).

   Flutter's skwasm engine draws on a worker thread only when the page is
   cross-origin isolated (window.crossOriginIsolated: COOP `same-origin` +
   COEP `require-corp` or `credentialless`). The page headers come from
   CloudFront (Terraform, owner-only), so a switch the admin can flip in
   seconds needs another place that sets them: this service worker.

   While it is registered and the switch is on, it answers the app's own
   page navigations with the same response plus the two headers. The app's
   own worker scripts (the database's drift_worker.js) always get COEP too,
   while it is registered: a worker started by an isolated page must carry
   COEP itself or Chrome refuses it (ERR_BLOCKED_BY_RESPONSE), and on a page
   that is not isolated the header changes nothing (both reproduced in
   docs/dev/COOP_COEP_TEST_2026-11-14.md). Everything else goes to the
   network untouched.

   boot_head.js registers it and says "on"; when the switch goes off it says
   "off" (the next page loads are no longer isolated) and removes the worker
   only from a page that is not isolated, so an isolated page never loses
   the headers of its workers half way.

   The mechanism (a service worker that re-serves the page with COOP/COEP)
   is the one of coi-serviceworker by Guido Zuidhof (MIT,
   github.com/gzuidhof/coi-serviceworker, THIRD_PARTY_NOTICES.md); this copy
   is narrower: page navigations and own worker scripts only, never the card
   page (/pay.html, Stripe frames) nor the company site and SEO pages, no
   forced reload, and `credentialless` only (Safari has neither, it stays
   single-threaded). */
'use strict';

/* The same first path segments CloudFront treats as public pages
   (infra/modules/web/main.tf, seo_index / app_noindex): not the app. */
var PUBLIC = /^\/(lawyers|attorneys|practice-areas|legal-questions|about|clients|for-attorneys|features|pricing|faq|contact|download|terms|privacy|delete-account|client-agreement|attorney-agreement|eula|refunds|third-party-services|cookies|sms-consent|dmca|accessibility)(\/|$)/;
var NEVER = ['/pay.html', '/pay.js'];
var WORKERS = ['worker', 'sharedworker'];
/* The page's last word ("1" / "0"), kept where a restarted worker finds it. */
var STATE_CACHE = 'lb-coi';
var STATE_KEY = '/__coi_state';

function isolates(url) {
  return url.origin === self.location.origin && NEVER.indexOf(url.pathname) === -1 && !PUBLIC.test(url.pathname);
}

function isOn() {
  return caches.open(STATE_CACHE)
    .then(function (c) { return c.match(STATE_KEY); })
    .then(function (r) { return r ? r.text() : '1'; })
    .then(function (v) { return v !== '0'; }, function () { return true; });
}

self.addEventListener('install', function (event) {
  /* Chrome 123+: only page navigations and worker scripts wake this
     worker; every other request (the app, the engine, images, the API)
     goes straight to the network, as without a worker. */
  if (event.addRoutes) {
    try {
      event.addRoutes([
        { condition: { requestMode: 'navigate' }, source: 'fetch-event' },
        { condition: { requestDestination: 'worker' }, source: 'fetch-event' },
        { condition: { requestDestination: 'sharedworker' }, source: 'fetch-event' },
        { condition: { urlPattern: new URLPattern({}) }, source: 'network' }
      ]);
    } catch (e) { /* no router: the fetch handler below lets them pass */ }
  }
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  var data = event.data;
  if (!data || typeof data.coi !== 'boolean') return;
  event.waitUntil(caches.open(STATE_CACHE).then(function (c) {
    return c.put(STATE_KEY, new Response(data.coi ? '1' : '0'));
  }));
});

function withHeaders(response, page) {
  /* A redirect or an error page of another kind: as it came. */
  if (response.type === 'opaqueredirect' || response.status === 0) return response;
  var headers = new Headers(response.headers);
  if (page) headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);
  if (request.mode === 'navigate') {
    if (!isolates(url)) return;
    event.respondWith(Promise.all([fetch(request), isOn()]).then(function (x) {
      return x[1] ? withHeaders(x[0], true) : x[0];
    }));
    return;
  }
  if (WORKERS.indexOf(request.destination) === -1 || url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(function (response) {
    return withHeaders(response, false);
  }));
});
