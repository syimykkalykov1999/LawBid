import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// Б6 / G8 (25.11): tells web/js/web_vitals_beacon.js where to send the
/// Core Web Vitals rating and whether it may (`window.lbWebVitals`). The
/// glue sends nothing until [allowed] is true.
void setWebVitalsConfig({required String endpoint, required bool allowed}) {
  globalContext.setProperty(
    'lbWebVitals'.toJS,
    {'endpoint': endpoint, 'allowed': allowed}.jsify(),
  );
}
