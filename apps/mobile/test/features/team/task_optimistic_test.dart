import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import 'team_fakes.dart';

/// Owner 26.11 (Apple Reminders, Todoist): a task's checkmark and its
/// delete change every list at once, before the server answers; a refusal
/// puts every list back as it was.
class _HeldRepo extends FakeTeamRepository {
  Completer<TaskItem>? status;
  Completer<void>? delete;
  int statusCalls = 0;
  int deleteCalls = 0;

  @override
  Future<TaskItem> setTaskStatus(
    String id,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
    int? version,
  }) {
    statusCalls++;
    return this.status!.future;
  }

  @override
  Future<void> deleteTask(String id) {
    deleteCalls++;
    return delete!.future;
  }
}

void main() {
  const open = (done: false, mine: false);
  const done = (done: true, mine: false);
  setUpAll(initializeDateFormatting);

  ProviderContainer boot(_HeldRepo repo) {
    final c = ProviderContainer(
      overrides: [teamRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(c.dispose);
    for (final k in [open, done]) {
      final sub = c.listen(tasksProvider(k), (_, __) {});
      addTearDown(sub.close);
    }
    return c;
  }

  Iterable<String> ids(ProviderContainer c, TasksKey k) =>
      c.read(tasksProvider(k)).value!.map((t) => t.id);

  test('done moves the row to the archive before the answer', () async {
    final repo = _HeldRepo()
      ..active = [makeTask('a'), makeTask('b')]
      ..done = []
      ..status = Completer<TaskItem>();
    final c = boot(repo);
    await c.read(tasksProvider(open).future);
    await c.read(tasksProvider(done).future);

    final pending = c
        .read(tasksProvider(open).notifier)
        .setStatus(makeTask('a'), TaskStatus.done);
    expect(ids(c, open), ['b'], reason: 'the row left at once');
    expect(ids(c, done), ['a']);
    expect(c.read(tasksProvider(done)).value!.single.status, TaskStatus.done);

    repo.status!.complete(makeTask('a', status: TaskStatus.done));
    await pending;
    expect(ids(c, open), ['b']);
    expect(ids(c, done), ['a']);
    expect(repo.statusCalls, 1);
  });

  test('a refused checkmark puts every list back and rethrows', () async {
    final repo = _HeldRepo()
      ..active = [makeTask('a'), makeTask('b')]
      ..done = [makeTask('d', status: TaskStatus.done)]
      ..status = Completer<TaskItem>();
    final c = boot(repo);
    await c.read(tasksProvider(open).future);
    await c.read(tasksProvider(done).future);

    final pending = c
        .read(tasksProvider(open).notifier)
        .setStatus(makeTask('a'), TaskStatus.done);
    expect(ids(c, open), ['b']);
    repo.status!.completeError(
      const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
    );
    await expectLater(pending, throwsA(isA<ApiException>()));
    expect(ids(c, open), ['a', 'b']);
    expect(ids(c, done), ['d']);
  });

  test('reopening brings a done task back to the active list at once',
      () async {
    final repo = _HeldRepo()
      ..active = []
      ..done = [makeTask('d', status: TaskStatus.done)]
      ..status = Completer<TaskItem>();
    final c = boot(repo);
    await c.read(tasksProvider(open).future);
    await c.read(tasksProvider(done).future);

    final pending = c.read(tasksProvider(done).notifier).setStatus(
          makeTask('d', status: TaskStatus.done, archivedAt: DateTime.now()),
          TaskStatus.open,
        );
    expect(ids(c, open), ['d']);
    expect(ids(c, done), isEmpty);
    repo.status!.complete(makeTask('d'));
    await pending;
    expect(ids(c, open), ['d']);
  });

  group('delete from the task sheet', () {
    Future<void> openAndDelete(WidgetTester tester, _HeldRepo repo) async {
      await tester.pumpWidget(
        uxApp(
          const Scaffold(body: TasksTab()),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [teamRepositoryProvider.overrideWithValue(repo)],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.tap(find.text('Task x1'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      final more = find.byKey(const ValueKey('task-more'));
      await tester.scrollUntilVisible(
        more,
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(more);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-delete-confirm')));
      await tester.pumpAndSettle();
    }

    testWidgets('the task leaves the list before the answer', (tester) async {
      final repo = _HeldRepo()
        ..active = [makeTask('x1'), makeTask('x2')]
        ..delete = Completer<void>();
      await openAndDelete(tester, repo);
      expect(find.text('Task x1'), findsNothing);
      expect(find.text('Task x2'), findsOneWidget);
      expect(repo.deleteCalls, 1);
      repo.delete!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Task x1'), findsNothing);
      expect(repo.deleteCalls, 1);
    });

    testWidgets('a refused delete brings the task back', (tester) async {
      final repo = _HeldRepo()
        ..active = [makeTask('x1'), makeTask('x2')]
        ..delete = Completer<void>();
      await openAndDelete(tester, repo);
      expect(find.text('Task x1'), findsNothing);
      repo.delete!.completeError(
        const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Task x1'), findsOneWidget);
      expect(find.text('Task x2'), findsOneWidget);
    });
  });
}
