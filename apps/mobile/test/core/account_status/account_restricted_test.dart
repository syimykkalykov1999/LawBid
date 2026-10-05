import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/account_status/account_restricted.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a limited account is told what
/// is limited and how to appeal; long texts wrap, buttons never move.
void main() {
  final router = GoRouter(
    routes: [GoRoute(path: '/', builder: (_, __) => const SizedBox())],
  );

  Widget host() => AccountRestrictedHost(
        router: router,
        child: const Scaffold(body: Text('the app')),
      );

  testWidgets('explains the limit with a way to support, then closes',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        host(),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [restrictionProvider.overrideWith(_Restricted.new)],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Account limited'), findsOneWidget);
    expect(find.text('Write to support'), findsOneWidget);
    await tester.tap(find.text('Got it'));
    await tester.pumpAndSettle();
    expect(find.text('Account limited'), findsNothing);
    expect(find.text('the app'), findsOneWidget);
  });

  testWidgets('Russian on a small phone with large text: no overflow',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        host(),
        size: const Size(320, 568),
        textScale: 1.6,
        theme: AppTheme.dark(),
        disableAnimations: true,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [restrictionProvider.overrideWith(_Restricted.new)],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Аккаунт ограничен'), findsOneWidget);
  });

  testWidgets('not limited: the app as is', (tester) async {
    await tester.pumpWidget(
      uxApp(
        host(),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Account limited'), findsNothing);
  });
}

class _Restricted extends RestrictionController {
  @override
  bool build() => true;
}
