import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/push_once.dart';

void main() {
  testWidgets('two quick taps open the screen once', (tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, _) => Scaffold(
            body: TextButton(
              key: const ValueKey('open'),
              onPressed: () => context.pushOnce<void>('/notifications'),
              child: const Text('open'),
            ),
          ),
        ),
        GoRoute(
          path: '/notifications',
          builder: (context, _) => const Scaffold(body: Text('notifications')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.byKey(const ValueKey('open')));
    await tester.tap(find.byKey(const ValueKey('open')), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('notifications'), findsOneWidget);
    expect(tester.takeException(), isNull);
    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('notifications'), findsNothing);
    expect(find.byKey(const ValueKey('open')), findsOneWidget);
  });
}
