import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/browser_download.dart';

import '../../helpers/fake_browser_tabs.dart';

/// Row 58 (owner 2026-11-12): Safari and phone browsers block a tab opened
/// after an `await`, so the website opens it in the tap and points it at
/// the link when the link arrives; the app opens the link as before.

void main() {
  tearDown(() {
    debugBrowserTabs = null;
    debugLaunchExternal = null;
  });

  group('website', () {
    test('the tab opens in the tap, before the link arrives', () async {
      final tabs = debugBrowserTabs = FakeTabs();
      final link = Completer<Uri?>();
      final done = openAfter(() => link.future);
      // Nothing awaited yet: the empty tab is already there.
      expect(tabs.opened, ['about:blank']);
      link.complete(Uri.parse('https://files.example/doc.pdf?sig=1'));
      expect(await done, isTrue);
      expect(tabs.tabs.single.went, ['https://files.example/doc.pdf?sig=1']);
      expect(tabs.tabs.single.closed, isFalse);
      expect(tabs.opened, hasLength(1));
    });

    test('an error closes the empty tab and is passed on', () async {
      final tabs = debugBrowserTabs = FakeTabs();
      await expectLater(
        openAfter(() async => throw StateError('server')),
        throwsStateError,
      );
      expect(tabs.tabs.single.closed, isTrue);
      expect(tabs.tabs.single.went, isEmpty);
    });

    test('no link: the tab closes and the answer is false', () async {
      final tabs = debugBrowserTabs = FakeTabs();
      expect(await openAfter(() async => null), isFalse);
      expect(tabs.tabs.single.closed, isTrue);
    });

    test('only http(s) links are shown in the tab', () async {
      final tabs = debugBrowserTabs = FakeTabs();
      expect(
        await openAfter(() async => Uri.parse('javascript:alert(1)')),
        isFalse,
      );
      expect(tabs.tabs.single.closed, isTrue);
      expect(tabs.tabs.single.went, isEmpty);
    });

    test('a blocked tab is false, never «opened»', () async {
      final tabs = debugBrowserTabs = FakeTabs(blocked: true);
      expect(
        await openAfter(() async => Uri.parse('https://files.example/a.pdf')),
        isFalse,
      );
      // It tried in the tap, then once more with the link.
      expect(tabs.opened, ['about:blank', 'https://files.example/a.pdf']);
    });

    test('blocked in the tap, allowed later: the link opens', () async {
      final tabs = debugBrowserTabs = FakeTabs(blocked: true);
      final pending = PendingTab.open();
      tabs.blocked = false;
      expect(
        await pending.go(Uri.parse('https://files.example/a.pdf')),
        isTrue,
      );
      expect(tabs.opened.last, 'https://files.example/a.pdf');
    });

    test('openInNewTab answers whether the tab opened', () async {
      debugBrowserTabs = FakeTabs(blocked: true);
      expect(await openInNewTab(Uri.parse('https://a.example/x')), isFalse);
      debugBrowserTabs = FakeTabs();
      expect(await openInNewTab(Uri.parse('https://a.example/x')), isTrue);
    });

    test('url_launcher is never used on the website path', () async {
      debugBrowserTabs = FakeTabs();
      var launched = 0;
      debugLaunchExternal = (_) async {
        launched++;
        return true;
      };
      await openAfter(() async => Uri.parse('https://a.example/x'));
      expect(launched, 0);
    });
  });

  group('app (iOS / Android)', () {
    test('awaits the link, then opens it outside the app', () async {
      final launched = <Uri>[];
      debugLaunchExternal = (u) async {
        launched.add(u);
        return true;
      };
      final link = Completer<Uri?>();
      final done = openAfter(() => link.future);
      await Future<void>.delayed(Duration.zero);
      expect(launched, isEmpty);
      link.complete(Uri.parse('https://files.example/doc.pdf'));
      expect(await done, isTrue);
      expect(launched, [Uri.parse('https://files.example/doc.pdf')]);
    });

    test('nothing opened it: false', () async {
      debugLaunchExternal = (_) async => false;
      expect(
        await openAfter(() async => Uri.parse('https://files.example/a')),
        isFalse,
      );
    });

    test('an error is passed on and nothing opens', () async {
      var launched = 0;
      debugLaunchExternal = (_) async {
        launched++;
        return true;
      };
      await expectLater(
        openAfter(() async => throw StateError('server')),
        throwsStateError,
      );
      expect(launched, 0);
    });
  });
}
