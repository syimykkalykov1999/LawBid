import 'package:lawbid/core/platform/browser_tab.dart';
import 'package:web/web.dart' as web;

/// `window.open` without `noopener`, so the result says whether the tab
/// really opened (with `noopener` the browser always answers null, which
/// is why url_launcher reports success even when the tab was blocked);
/// the opener link is cut right after instead.
final BrowserTabs tabs = _WebTabs();

class _WebTabs implements BrowserTabs {
  @override
  BrowserTab? open(String url) {
    final w = web.window.open(url, '_blank');
    if (w == null) return null;
    final tab = _WebTab(w);
    if (url != 'about:blank') tab.cutOpener();
    return tab;
  }
}

class _WebTab implements BrowserTab {
  _WebTab(this._w);

  final web.Window _w;

  void cutOpener() {
    try {
      _w.opener = null;
    } on Object {
      // Already on another origin: nothing left to cut.
    }
  }

  @override
  void go(String url) {
    cutOpener();
    _w.location.href = url;
  }

  @override
  void close() {
    try {
      _w.close();
    } on Object {
      // The user closed it already.
    }
  }
}
