import 'package:lawbid/core/platform/browser_tab.dart';

/// Stand-ins for the browser's tabs (row 58 tests).
class FakeTab implements BrowserTab {
  final went = <String>[];
  bool closed = false;

  @override
  void go(String url) => went.add(url);

  @override
  void close() => closed = true;
}

class FakeTabs implements BrowserTabs {
  FakeTabs({this.blocked = false});

  /// Like a popup blocker: every open answers null.
  bool blocked;
  final opened = <String>[];
  final tabs = <FakeTab>[];

  @override
  BrowserTab? open(String url) {
    opened.add(url);
    if (blocked) return null;
    final t = FakeTab();
    tabs.add(t);
    return t;
  }
}
