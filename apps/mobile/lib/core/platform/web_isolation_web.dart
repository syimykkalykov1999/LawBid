import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// `window.__lbCoi(on)` from boot_head.js: registers or removes coi_sw.js.
void tellPage({required bool on}) {
  try {
    if (globalContext.has('__lbCoi')) {
      globalContext.callMethod('__lbCoi'.toJS, on.toJS);
    }
  } on Object {
    // An old page without the function: boot_head.js reads the answer at the
    // next load anyway.
  }
}
