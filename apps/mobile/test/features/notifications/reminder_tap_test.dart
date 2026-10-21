import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/features/notifications/application/task_reminders.dart';

void main() {
  Future<GoRouter> pump(WidgetTester tester, String start) async {
    final router = GoRouter(
      initialLocation: start,
      routes: [
        GoRoute(path: '/mine', builder: (_, __) => const Text('mine')),
        GoRoute(
          path: '/chat/:id',
          builder: (_, s) => Text('chat ${s.pathParameters['id']}'),
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('a tap while the planner is open does not push it again', (
    tester,
  ) async {
    final router = await pump(tester, '/mine');
    openReminderRoute(router, '/mine');
    openReminderRoute(router, '/mine');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('mine'), findsOneWidget);
  });

  testWidgets('a tap over a chat opens the planner (app already running)', (
    tester,
  ) async {
    final router = await pump(tester, '/chat/7');
    expect(find.text('chat 7'), findsOneWidget);
    openReminderRoute(router, '/mine');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('mine'), findsOneWidget);
  });

  testWidgets('the same tap twice in a row (cold start) opens it once', (
    tester,
  ) async {
    final router = await pump(tester, '/chat/7');
    openReminderRoute(router, '/mine');
    openReminderRoute(router, '/mine');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('mine'), findsOneWidget);
  });
}
