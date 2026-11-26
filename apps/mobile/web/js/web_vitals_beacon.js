/* Б6 / G8 (25.11): Core Web Vitals of real visits (web.dev «Core Web Vitals»,
   library web-vitals 6.2.3 by Google, Apache-2.0, vendored unmodified in
   vendor/web-vitals-6.2.3/; THIRD_PARTY_NOTICES.md).

   LCP, INP, CLS and TTFB are measured by the library as is. Only the rating
   web.dev defines for each (good / needs-improvement / poor) leaves the
   browser, as anonymous usage events `web_vital_<metric>_<good|ni|poor>`
   through the app's own events intake (POST /app-events), with
   navigator.sendBeacon when the page is hidden (web.dev's advice: the last
   values are only final then, and a beacon survives the tab closing).
   No value, no URL, no id: the server only adds the ratings up
   (`{metric:"slo_client"}` minute line; CloudWatch alarm when fewer than 75 %
   of visits are «good» = the p75 rule of web.dev).

   Nothing is sent until the app says so: the Flutter code sets
   window.lbWebVitals = {endpoint, allowed} (lib/core/diagnostics/
   web_vitals_bridge_web.dart): allowed = the person said yes to usage
   statistics AND the admin switch client.web_vitals_enabled is on. */
(function () {
  'use strict';
  var wv = window.webVitals;
  if (!wv || !navigator.sendBeacon) return;
  var pending = {};
  function rating(r) {
    return r === 'good' ? 'good' : r === 'poor' ? 'poor' : 'ni';
  }
  function keep(metric) {
    // The newest rating of each metric wins (CLS and INP change while the page lives).
    pending[metric.name] = 'web_vital_' + String(metric.name).toLowerCase() + '_' + rating(metric.rating);
  }
  try {
    wv.onLCP(keep);
    wv.onINP(keep);
    wv.onCLS(keep);
    wv.onTTFB(keep);
  } catch (e) {
    return;
  }
  function send() {
    var cfg = window.lbWebVitals;
    var names = Object.keys(pending).map(function (k) { return pending[k]; });
    pending = {};
    if (!cfg || cfg.allowed !== true || !cfg.endpoint || names.length === 0) return;
    var body = JSON.stringify({ events: names.slice(0, 50).map(function (n) { return { name: n }; }) });
    try {
      // A string body is sent as text/plain: no CORS preflight (the API
      // parses it as JSON on this route).
      navigator.sendBeacon(cfg.endpoint, body);
    } catch (e) {
      /* telemetry never breaks the page */
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') send();
  });
  window.addEventListener('pagehide', send);
})();
