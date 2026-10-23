import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';

Widget _host(Widget child) => ProviderScope(
      child: MaterialApp(
        theme: AppTheme.light(),
        home: child,
      ),
    );

void main() {
  testWidgets('shows the screen once its library has loaded', (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'test_ok',
          load: () => gate.future,
          builder: (_) => const Text('screen'),
        ),
      ),
    );
    expect(find.text('screen'), findsNothing);
    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('screen'), findsOneWidget);
  });

  testWidgets('a library that loaded once builds on the first frame', (
    tester,
  ) async {
    await DeferredScreen.prefetch('test_cached', () async {});
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'test_cached',
          load: () => throw StateError('must not load twice'),
          builder: (_) => const Text('cached'),
        ),
      ),
    );
    expect(find.text('cached'), findsOneWidget);
  });

  testWidgets('a failed load offers a retry that loads again', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'test_retry',
          load: () async {
            calls++;
            if (calls == 1) throw StateError('offline');
          },
          builder: (_) => const Text('back online'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.byType(AppButton), findsOneWidget);
    await tester.tap(find.byType(AppButton));
    await tester.pump();
    await tester.pump();
    expect(find.text('back online'), findsOneWidget);
    expect(calls, 2);
  });
}
