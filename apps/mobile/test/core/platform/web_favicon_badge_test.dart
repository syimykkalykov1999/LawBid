import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/platform/web_tab_title.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:material_ui/material_ui.dart';

class _SignedIn extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'test-access-token',
        sub: 'user-1',
        role: 'client',
        sid: 's1',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );
}

void main() {
  final calls = <(int, String, String)>[];

  setUp(() {
    calls.clear();
    debugWebTabTitleOverride = true;
    debugFaviconBadgeSetter = (count, {required background, required color}) =>
        calls.add((count, background, color));
  });
  tearDown(() {
    debugWebTabTitleOverride = null;
    debugFaviconBadgeSetter = null;
  });

  Future<ProviderContainer> pump(WidgetTester tester) async {
    final c = ProviderContainer(
      overrides: [sessionControllerProvider.overrideWith(_SignedIn.new)],
    );
    addTearDown(c.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          theme: AppTheme.light(),
          builder: (context, child) => WebTabTitle(
            appName: 'LawBid',
            color: Theme.of(context).primaryColor,
            child: child!,
          ),
          home: const SizedBox.shrink(),
        ),
      ),
    );
    return c;
  }

  testWidgets(
    'row 113: the tab icon shows the unread number in the unread pill '
    'colours, and goes plain at 0',
    (tester) async {
      final c = await pump(tester);
      expect(calls, isEmpty, reason: 'a fresh page keeps the plain icon');

      c.read(webTabUnreadProvider.notifier).set(3);
      await tester.pump();
      expect(calls, [(3, '#c8a765', '#0a1a3f')]);
      expect(
        find.byWidgetPredicate((w) => w is Title && w.title == '(3) LawBid'),
        findsOneWidget,
      );

      // The same number again draws nothing new.
      c.read(webTabUnreadProvider.notifier).set(3);
      await tester.pump();
      expect(calls, hasLength(1));

      c.read(webTabUnreadProvider.notifier).set(0);
      await tester.pump();
      expect(calls.last.$1, 0);
    },
  );

  testWidgets('phones (not the website): no badge, no title change', (
    tester,
  ) async {
    debugWebTabTitleOverride = false;
    final c = await pump(tester);
    c.read(webTabUnreadProvider.notifier).set(5);
    await tester.pump();
    expect(calls, isEmpty);
  });

  test('index.html loads the copied Tinycon before the app starts', () {
    final html = File('web/index.html').readAsStringSync();
    final tinycon = html.indexOf('<script src="tinycon.js"');
    expect(tinycon, greaterThan(0));
    expect(tinycon, lessThan(html.indexOf('flutter_bootstrap.js" async')));
    // Copied whole (MIT): the upstream 0.6.8 file, licence header kept.
    final js = File('web/tinycon.js').readAsStringSync();
    expect(js, contains('@license MIT Licensed'));
    expect(js, contains('Tinycon.setBubble = function'));
  });
}
