{{flutter_js}}
{{flutter_build_config}}
// Row 170 (14.11): Flutter's documented template (docs.flutter.dev,
// "Customizing web app initialization") without the deprecated
// serviceWorkerSettings step (flutter/flutter#156910): the loader no longer
// checks a service worker, and waits up to 4 s for one, on every start.
// scripts/deploy/web-immutable.py adds the folders (config) to this call.
_flutter.loader.load({});
