import 'package:lawbid/core/session/browser_session_hint_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/session/browser_session_hint_web.dart'
    as impl;

/// Owner 2026-11-04 (web audit R-190/R-192): on the website the refresh
/// token is an HttpOnly *browser-session* cookie (`lb_rt`, see
/// apps/api/src/modules/auth/web-session-cookie.ts), but the app's "this
/// tab is signed in" marker lived only in the tab's sessionStorage. A new
/// tab (a link opened from mail, Ctrl+click, a second window) had the
/// cookie yet no marker, so it showed the welcome screen and asked for the
/// password again, while the first tab stayed signed in.
///
/// This hint is a plain, non-secret browser-session cookie on the page's
/// own origin: it says only "this browser signed in", never holds a token,
/// and dies when the browser closes, exactly like `lb_rt` (closing the
/// browser still signs the website out). A tab without the marker but with
/// the hint tries one cookie refresh; a stale hint costs one 401, after
/// which it is removed. Phones have no hint (a no-op).
abstract interface class BrowserSessionHint {
  bool get isSet;

  void set();

  void clear();

  /// The browser's hint on the web, a no-op elsewhere.
  static final BrowserSessionHint platform = impl.createBrowserSessionHint();
}

/// No browser: nothing is ever set.
class NoBrowserSessionHint implements BrowserSessionHint {
  const NoBrowserSessionHint();

  @override
  bool get isSet => false;

  @override
  void set() {}

  @override
  void clear() {}
}
