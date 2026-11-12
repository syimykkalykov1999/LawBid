import 'package:lawbid/core/platform/browser_tab_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/browser_tab_web.dart'
    as impl;

/// A browser tab this page opened (row 58, owner 2026-11-12).
abstract interface class BrowserTab {
  /// Points the tab at [url], cut off from this page (`opener = null`).
  void go(String url);

  /// Closes the tab (nothing came to show in it).
  void close();
}

/// Opens browser tabs. Safari, iOS and Android browsers allow a new tab
/// only while the user's tap still counts, so [open] has to run in the
/// tap, before any `await`. An interface (not a function) so tests can
/// stand in for the browser.
// ignore: one_member_abstracts
abstract interface class BrowserTabs {
  /// A new tab at [url], or null when the browser blocked it (popups).
  BrowserTab? open(String url);
}

/// The page's own tabs; outside the browser it opens nothing.
BrowserTabs get platformBrowserTabs => impl.tabs;
