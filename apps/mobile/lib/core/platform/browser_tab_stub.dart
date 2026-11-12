import 'package:lawbid/core/platform/browser_tab.dart';

/// Outside the browser there are no tabs.
final BrowserTabs tabs = _NoTabs();

class _NoTabs implements BrowserTabs {
  @override
  BrowserTab? open(String url) => null;
}
