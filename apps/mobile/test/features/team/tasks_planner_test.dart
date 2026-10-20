import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_links.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';

import '../../helpers/ux_harness.dart';
import 'team_fakes.dart';

/// Owner 2026-10-05: the planner upgrade — several addresses and people,
/// «Сегодня», filters, swipes, choosing several, the archive.
void main() {
  late FakeTeamRepository repo;
  setUpAll(initializeDateFormatting);
  setUp(() => repo = FakeTeamRepository());

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    double textScale = 1,
    ThemeData? theme,
    Size? size,
  }) async {
    if (size != null) {
      tester.view
        ..physicalSize = size
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }
    await tester.pumpWidget(
      uxApp(
        Scaffold(body: child),
        theme: theme ?? AppTheme.light(),
        disableAnimations: true,
        textScale: textScale,
        size: size ?? const Size(390, 844),
        overrides: uxOverrides(
          extra: [teamRepositoryProvider.overrideWithValue(repo)],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  group('plain links, nothing paid', () {
    test('an address opens Google / Apple Maps and directions', () {
      const a = '50 W Washington St, Chicago, IL';
      final g = TaskLinks.googleMaps(a);
      expect(g.host, 'www.google.com');
      expect(g.path, '/maps/search/');
      expect(g.queryParameters, {'api': '1', 'query': a});
      expect(TaskLinks.appleMaps(a).host, 'maps.apple.com');
      expect(TaskLinks.directions(a).queryParameters['destination'], a);
    });

    test('a phone becomes a call, an email a letter', () {
      expect(
        TaskLinks.call('+1 (312) 555-0199').toString(),
        'tel:+13125550199',
      );
      expect(
        TaskLinks.mail('a@b.co', subject: 'Court docs').toString(),
        'mailto:a@b.co?subject=Court%20docs',
      );
    });
  });

  group('filters', () {
    final now = DateTime(2026, 10, 5, 10);
    final tasks = [
      makeTask('over', dueAt: DateTime(2026, 10, 4, 9)),
      makeTask('today', dueAt: DateTime(2026, 10, 5, 15)),
      makeTask(
        'week',
        dueAt: DateTime(2026, 10, 9, 9),
        priority: TaskPriority.urgent,
        caseId: 'c1',
      ),
      makeTask('later', dueAt: DateTime(2026, 11, 1, 9)),
      makeTask('none', assigneeName: 'Sam'),
    ];
    List<String> ids(TaskFilter f, {String q = ''}) => [
          for (final t in applyTaskFilter(tasks, f, now: now, query: q)) t.id,
        ];

    test('period, case, assignee, search, priority order', () {
      expect(
        ids(const TaskFilter(period: TaskPeriod.today)),
        ['over', 'today'],
      );
      expect(
        ids(const TaskFilter(period: TaskPeriod.week)),
        ['over', 'today', 'week'],
      );
      expect(ids(const TaskFilter(period: TaskPeriod.overdue)), ['over']);
      expect(ids(const TaskFilter(period: TaskPeriod.noDate)), ['none']);
      expect(ids(const TaskFilter(caseId: 'c1')), ['week']);
      expect(ids(const TaskFilter(assignee: 'm-Sam')), ['none']);
      expect(ids(const TaskFilter(), q: 'task lat'), ['later']);
      expect(ids(const TaskFilter(sort: TaskSort.priority)).first, 'week');
    });
  });

  group('the list', () {
    testWidgets('swipe right — done', (tester) async {
      repo.active = [
        makeTask('s1', dueAt: DateTime.now().add(const Duration(hours: 1))),
      ];
      await pump(tester, const TasksTab());
      await tester.drag(
        find.byKey(const ValueKey('task-s1')),
        const Offset(500, 0),
      );
      await tester.pumpAndSettle();
      expect(repo.calls, contains('status:s1:done:null'));
    });

    testWidgets('swipe left — tomorrow, with Undo', (tester) async {
      repo.active = [
        makeTask('s2', dueAt: DateTime.now().add(const Duration(hours: 1))),
      ];
      await pump(tester, const TasksTab());
      await tester.drag(
        find.byKey(const ValueKey('task-s2')),
        const Offset(-500, 0),
      );
      await tester.pumpAndSettle();
      // Owner 2026-10-15: no sheet — straight to tomorrow.
      expect(repo.calls, contains('move:s2'));
      expect(find.text('Moved to tomorrow'), findsOneWidget);
    });

    testWidgets('long press picks several; delete asks first', (tester) async {
      repo.active = [
        makeTask('b1', dueAt: DateTime.now().add(const Duration(hours: 1))),
        makeTask('b2', dueAt: DateTime.now().add(const Duration(hours: 2))),
        makeTask('b3', dueAt: DateTime.now().add(const Duration(hours: 3))),
      ];
      await pump(tester, const TasksTab());
      await tester.longPress(find.byKey(const ValueKey('task-b1')));
      await tester.pumpAndSettle();
      expect(find.text('Selected: 1'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('task-b2')));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Selected: 2'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tasks-bulk-delete')));
      await tester.pumpAndSettle();
      expect(find.text('Delete 2 tasks?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tasks-bulk-delete-confirm')));
      await tester.pumpAndSettle();
      expect(repo.calls.last, startsWith('bulk:delete:'));
      expect(repo.calls.last, contains('b1'));
      expect(repo.calls.last, contains('b2'));
      expect(find.text('Task b3'), findsOneWidget);
      // The "Done: 2" note goes away.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      // Select all → mark done.
      await tester.longPress(find.byKey(const ValueKey('task-b3')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('tasks-choose-all')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('tasks-bulk-done')));
      await tester.pumpAndSettle();
      expect(repo.calls.last, 'bulk:status:b3');
    });

    testWidgets('«Сегодня» keeps the overdue and today groups', (tester) async {
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      repo.active = [
        makeTask('o', dueAt: today.subtract(const Duration(hours: 3))),
        makeTask('t', dueAt: today.add(const Duration(hours: 20))),
        makeTask('n'),
      ];
      await pump(tester, const TasksTab(initialView: TasksView.today));
      await tester.pumpAndSettle();
      // Owner 2026-10-15: «Today» is the overdue and today's groups.
      expect(find.text('OVERDUE'), findsOneWidget);
      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('Task n'), findsNothing);
    });

    testWidgets('the task search box searches the tasks of the view shown',
        (tester) async {
      repo.active = [makeTask('a1'), makeTask('b2')];
      await pump(tester, const TasksTab());
      await tester.pumpAndSettle();
      // Owner 2026-10-19: the field opens from the magnifier by «+».
      expect(find.byKey(const ValueKey('tasks-search')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('tasks-search-open')));
      await tester.pumpAndSettle();
      expect(find.text('Search tasks'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('tasks-search')),
        'B2',
      );
      await tester.pumpAndSettle();
      expect(find.text('Task a1'), findsNothing);
      expect(find.text('Task b2'), findsOneWidget);
      // Its cross closes it and the whole list is back.
      await tester.tap(find.byKey(const ValueKey('tasks-search-close')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('tasks-search')), findsNothing);
      expect(find.text('Task a1'), findsOneWidget);
    });

    testWidgets('the archive tells about the yearly cleanup', (tester) async {
      final at = DateTime.now().subtract(const Duration(days: 10));
      repo.done = [
        makeTask(
          'a1',
          status: TaskStatus.done,
          archivedAt: at,
          purgeAt: at.add(const Duration(days: 365)),
        ),
        makeTask(
          'a2',
          status: TaskStatus.done,
          archivedAt: at,
          keepForever: true,
        ),
      ];
      await pump(tester, const TasksTab(initialView: TasksView.archive));
      expect(find.byKey(const ValueKey('tasks-archive-note')), findsOneWidget);
      expect(
        find.textContaining('Finished tasks are kept for a year'),
        findsOneWidget,
      );
      // Search in the archive.
      await tester.tap(find.byKey(const ValueKey('tasks-search-open')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('tasks-archive-search')),
        'a2',
      );
      await tester.pumpAndSettle();
      expect(find.text('Task a1'), findsNothing);
      expect(find.text('Task a2'), findsOneWidget);
      // Choose → keep forever / restore.
      await tester.longPress(find.byKey(const ValueKey('task-a2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('tasks-bulk-keep')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tasks-bulk-unarchive')));
      await tester.pumpAndSettle();
      expect(repo.calls.last, 'bulk:unarchive:a2');
    });

    testWidgets('long words: 200% text, dark — nothing overflows',
        (tester) async {
      repo.active = [
        makeTask(
          'l1',
          dueAt: DateTime.now(),
          places: const [TaskPlace(address: '50 W Washington St, Chicago')],
          priority: TaskPriority.urgent,
          assigneeName: 'Samantha Helperson-Longname',
        ),
      ];
      await pump(
        tester,
        const TasksTab(),
        theme: AppTheme.dark(),
        textScale: 2,
      );
      expect(tester.takeException(), isNull);
      await tester.longPress(find.byKey(const ValueKey('task-l1')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });
}
