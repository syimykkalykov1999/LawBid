{{flutter_js}}
{{flutter_build_config}}

// Owner row 173 (2026-11-14): Flutter's own template passes
// `serviceWorkerSettings` (its deprecated service worker, flutter/flutter
// #156910). With them the loader registers flutter_service_worker.js over
// whatever worker already controls the page's scope, and that worker
// unregisters itself, so the cross-origin isolation worker (coi_sw.js,
// admin switch `web.cross_origin_isolation`) would be removed on every
// start. Without them the loader registers nothing (flutter.js:
// loadServiceWorker returns at once for empty settings). The deploy merges
// its config object into this call (scripts/deploy/web-immutable.py).
_flutter.loader.load({});
