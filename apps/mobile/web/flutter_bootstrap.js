{{flutter_js}}
{{flutter_build_config}}
// Row 170 (14.11): Flutter's documented template (docs.flutter.dev,
// "Customizing web app initialization") without the deprecated
// serviceWorkerSettings step (flutter/flutter#156910): the loader no longer
// checks a service worker, and waits up to 4 s for one, on every start.
// Owner row 173 (2026-11-14): this also keeps the cross-origin isolation
// worker alive. With serviceWorkerSettings the loader registers
// flutter_service_worker.js over whatever worker already controls the
// page's scope, and that worker unregisters itself, so coi_sw.js (admin
// switch `web.cross_origin_isolation`) would be removed on every start.
// Without them the loader registers nothing (flutter.js: loadServiceWorker
// returns at once for empty settings).
// scripts/deploy/web-immutable.py adds the folders (config, and the
// WEB_SKWASM_THREADS choice) to this call.
_flutter.loader.load({});
