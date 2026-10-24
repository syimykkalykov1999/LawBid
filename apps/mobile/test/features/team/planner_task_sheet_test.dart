import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/planner_task_sheet.dart';

import '../../helpers/ux_harness.dart';
import 'team_fakes.dart';

/// Owner 2026-10-19: the full «New task» screen (the grid of kinds) is gone;
/// a planner task is added and edited in the «Новая задача» sheet.
void main() {
  late FakeTeamRepository repo;
  setUpAll(initializeDateFormatting);
  setUp(() => repo = FakeTeamRepository());

  Future<void> open(
    WidgetTester tester, {
    TaskItem? existing,
    String? conversationId,
    List<TaskPerson> people = const [],
  }) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => showPlannerTaskSheet(
                context,
                ref,
                existing: existing,
                caseId: existing == null ? 'c1' : null,
                caseTitle: existing == null ? 'Smith v. Jones' : null,
                conversationId: conversationId,
                people: people,
              ),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [teamRepositoryProvider.overrideWithValue(repo)],
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('a new task: case preset, chat and person kept, kind «other»',
      (tester) async {
    await open(
      tester,
      conversationId: 'chat-1',
      people: const [TaskPerson(name: 'Ann Lee', userId: 'u-ann')],
    );
    expect(find.text('Smith v. Jones'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'Call the clerk');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create'));
    await tester.pumpAndSettle();
    final d = repo.lastDraft!;
    expect(d.kind, TaskKind.other);
    expect(d.title, 'Call the clerk');
    expect(d.caseId, 'c1');
    expect(d.conversationId, 'chat-1');
    expect(d.people.single.name, 'Ann Lee');
    expect(tester.takeException(), isNull);
  });

  testWidgets('editing keeps what the sheet does not show', (tester) async {
    final base = makeTask(
      'e1',
      kind: TaskKind.meeting,
      dueAt: DateTime(2030, 1, 2, 10),
      places: const [TaskPlace(address: '50 W Washington St')],
      keepForever: true,
      caseId: 'c9',
      caseTitle: 'Doe estate',
      steps: const [TaskStep(id: 'st1', title: 'Bring the file')],
    );
    final task = TaskItem(
      id: base.id,
      kind: base.kind,
      title: base.title,
      status: base.status,
      createdAt: base.createdAt,
      notes: 'Room 4',
      dueAt: base.dueAt,
      places: base.places,
      people: base.people,
      keepForever: true,
      caseId: base.caseId,
      caseTitle: base.caseTitle,
      steps: base.steps,
      repeat: TaskRepeat.weekly,
      conversationId: 'chat-7',
    );
    repo.active = [task];
    await open(tester, existing: task);
    // Prefilled: title, notes, the step, the case.
    expect(find.text('Task e1'), findsOneWidget);
    expect(find.text('Room 4'), findsOneWidget);
    expect(find.text('Bring the file'), findsOneWidget);
    expect(find.text('Doe estate'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'Meet the judge');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    final d = repo.lastDraft!;
    expect(repo.calls, contains('update:e1:Meet the judge'));
    expect(d.kind, TaskKind.meeting);
    expect(d.notes, 'Room 4');
    expect(d.places.single.address, '50 W Washington St');
    expect(d.people.single.name, 'John Brown');
    expect(d.repeat, TaskRepeat.weekly);
    expect(d.conversationId, 'chat-7');
    expect(d.keepForever, isTrue);
    expect(d.caseId, 'c9');
    // The unchanged step is left alone.
    expect(repo.calls.where((c) => c.startsWith('step')), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a tap in the empty description area focuses the description',
      (tester) async {
    await open(tester);
    final field = find.byType(TextField).at(1);
    final rect = tester.getRect(field);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(field).focusNode!.hasFocus, isFalse);
    // Well below the one text line, still inside the area.
    await tester.tapAt(Offset(rect.center.dx, rect.bottom + 60));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(field).focusNode!.hasFocus, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the priority picker is a raised sheet with its title',
      (tester) async {
    await open(tester);
    await tester.tap(find.byIcon(AppIcons.flagOutlined).last);
    await tester.pumpAndSettle();
    final title = find.text('Priority');
    expect(title, findsOneWidget);
    expect(find.byKey(const ValueKey('compose-priority-0')), findsOneWidget);
    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    // The sheet reaches well above the bottom edge and the title is clear
    // of it.
    expect(tester.getTopLeft(title).dy, lessThan(size.height * 0.75));
    expect(tester.getBottomLeft(title).dy, lessThan(size.height - 100));
    await tester.tap(find.byKey(const ValueKey('compose-priority-3')));
    await tester.pumpAndSettle();
    expect(find.text('Priority'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
