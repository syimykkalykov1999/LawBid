import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_join_screen.dart';
import 'package:lawbid/features/team/presentation/task_editor_screen.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';
import 'package:lawbid/features/team/presentation/team_inbox_tab.dart';
import 'package:lawbid/features/team/presentation/team_screen.dart';

import '../../helpers/ux_harness.dart';
import 'team_fakes.dart';

/// OQ-048: tasks (Mine → Tasks), the attorney's Team, approvals and an
/// assistant joining.
void main() {
  late FakeTeamRepository repo;
  setUpAll(initializeDateFormatting);
  setUp(() => repo = FakeTeamRepository());

  Future<void> pump(WidgetTester tester, Widget child,
      {ThemeData? theme, double textScale = 1, bool assistant = false}) async {
    await tester.pumpWidget(uxApp(
      Scaffold(body: child),
      theme: theme ?? AppTheme.light(),
      disableAnimations: true,
      textScale: textScale,
      overrides: uxOverrides(extra: [
        teamRepositoryProvider.overrideWithValue(repo),
        if (assistant) isAssistantProvider.overrideWithValue(true),
      ]),
    ));
    await tester.pump();
    await tester.pump();
  }

  group('groupTasksByDay', () {
    test('overdue, today, tomorrow, dates, no date', () {
      final now = DateTime(2026, 10, 1, 12);
      final sections = groupTasksByDay(
        [
          makeTask('a', dueAt: DateTime(2026, 9, 30, 9)),
          makeTask('b', dueAt: DateTime(2026, 10, 1, 15)),
          makeTask('c', dueAt: DateTime(2026, 10, 2, 9)),
          makeTask('d', dueAt: DateTime(2026, 10, 9, 9)),
          makeTask('e'),
        ],
        const StaticTranslatorEn(),
        L10nFormats(AppLanguage.en),
        now: now,
      );
      expect(sections.map((s) => s.title), [
        'Overdue',
        'Today',
        'Tomorrow',
        'October 9, 2026',
        'No date',
      ]);
    });
  });

  group('TasksTab', () {
    testWidgets('empty: the add button', (tester) async {
      await pump(tester, const TasksTab());
      expect(find.text('No tasks'), findsOneWidget);
      expect(find.byKey(const ValueKey('tasks-add')), findsOneWidget);
    });

    testWidgets('a double tap marks the task done', (tester) async {
      repo.active = [
        makeTask('t1', dueAt: DateTime.now().add(const Duration(hours: 2))),
      ];
      await pump(tester, const TasksTab());
      expect(find.text('Task t1'), findsOneWidget);
      expect(find.text('Set by: Sam'), findsOneWidget);
      // Double tap on the card = done.
      await tester.tap(find.text('Task t1'));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.text('Task t1'));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('status:t1:done:null'));
      expect(find.text('Task t1'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('tasks-view-done')));
      await tester.pump();
      await tester.pump();
      expect(find.text('Task t1'), findsOneWidget);
    });

    testWidgets('not done: note + move to another time', (tester) async {
      repo.active = [makeTask('t2', dueAt: DateTime.now())];
      await pump(tester, const TasksTab());
      await tester.tap(find.text('Task t2'));
      // A single tap waits out the double-tap window.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('task-not-done')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-not-done')));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const ValueKey('task-outcome')), 'No answer');
      await tester.tap(find.byKey(const ValueKey('task-outcome-save')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('status:t2:not_done:No answer'));
    });

    testWidgets('dark theme, 200% text: no overflow', (tester) async {
      repo.active = [
        makeTask('t3', dueAt: DateTime.now(), note: 'Long note'),
        makeTask('t4', kind: TaskKind.court, by: null),
      ];
      await pump(tester, const TasksTab(),
          theme: AppTheme.dark(), textScale: 2);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('TaskEditorScreen: kind, title → created', (tester) async {
    await pump(tester, const TaskEditorScreen());
    await tester.tap(find.byKey(const ValueKey('task-kind-court')));
    await tester.pump();
    final save = find.byKey(const ValueKey('task-save'));
    await tester.scrollUntilVisible(save, 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(save);
    await tester.pump();
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('task-title')), -300,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Fill in this field'), findsOneWidget);
    await tester.enterText(
        find.byKey(const ValueKey('task-title')), 'Hearing at 10');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(save, 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(save);
    await tester.pump();
    await tester.pump();
    expect(repo.calls, contains('create:court:Hearing at 10'));
  });

  testWidgets('TaskEditorScreen: each kind asks for its own fields',
      (tester) async {
    // A tall screen: the whole form is built at once.
    tester.view.physicalSize = const Size(1200, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(uxApp(
      const Scaffold(body: TaskEditorScreen()),
      theme: AppTheme.light(),
      size: const Size(1200, 4000),
      disableAnimations: true,
      overrides: uxOverrides(extra: [
        teamRepositoryProvider.overrideWithValue(repo),
      ]),
    ));
    await tester.pump();
    // Call: whom + phone, no address / email.
    expect(find.text('Whom to call'), findsOneWidget);
    expect(find.byKey(const ValueKey('task-contact-phone')), findsOneWidget);
    expect(find.byKey(const ValueKey('task-location')), findsNothing);
    expect(find.byKey(const ValueKey('task-contact-email')), findsNothing);
    // Email: whom + address.
    await tester.tap(find.byKey(const ValueKey('task-kind-email')));
    await tester.pump();
    expect(find.text('Whom to write to'), findsOneWidget);
    expect(find.byKey(const ValueKey('task-contact-email')), findsOneWidget);
    expect(find.byKey(const ValueKey('task-contact-phone')), findsNothing);
    // Visit: where to go.
    await tester.ensureVisible(find.byKey(const ValueKey('task-kind-visit')));
    await tester.tap(find.byKey(const ValueKey('task-kind-visit')));
    await tester.pump();
    expect(find.text('Where to go (address)'), findsOneWidget);
  });

  group('Taking a checkmark back (owner 2026-10-01)', () {
    testWidgets('the status mark toggles done ⇄ back to work; Undo',
        (tester) async {
      repo.active = [makeTask('u1', dueAt: DateTime.now())];
      await pump(tester, const TasksTab());
      await tester.tap(find.byKey(const ValueKey('task-check-u1')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('status:u1:done:null'));
      // Undo in the snackbar brings it back.
      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('status:u1:open:null'));
      expect(find.text('Task u1'), findsOneWidget);
    });

    testWidgets('in Done: tapping the mark sends the task back to work',
        (tester) async {
      repo.done = [makeTask('u2', status: TaskStatus.done)];
      await pump(tester, const TasksTab());
      await tester.tap(find.byKey(const ValueKey('tasks-view-done')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-check-u2')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('status:u2:open:null'));
      expect(find.text('Task u2'), findsNothing);
    });

    testWidgets('a finished checklist: unchecking a step reopens it',
        (tester) async {
      repo.done = [
        makeTask('u3', status: TaskStatus.done, steps: const [
          TaskStep(id: 'a', title: 'Call A', status: TaskStatus.done),
          TaskStep(id: 'b', title: 'Call B', status: TaskStatus.done),
        ]),
      ];
      await pump(tester, const TasksTab());
      await tester.tap(find.byKey(const ValueKey('tasks-view-done')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('step-check-b')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('step:u3:b:open:null'));
      expect(find.text('Task u3'), findsNothing, reason: 'back in Active');
    });
  });

  group('Task steps (owner 2026-10-01)', () {
    TaskItem withSteps() => makeTask(
          's',
          dueAt: DateTime.now().add(const Duration(hours: 3)),
          steps: [
            TaskStep(
              id: 's1',
              title: 'Call Brown',
              dueAt: DateTime.now().add(const Duration(hours: 1)),
            ),
            const TaskStep(id: 's2', title: 'Call Lee'),
          ],
        );

    testWidgets('the card shows progress; a box checks one step',
        (tester) async {
      repo.active = [withSteps()];
      await pump(tester, const TasksTab());
      expect(find.text('0 of 2'), findsOneWidget);
      expect(find.text('Call Brown'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('step-check-s1')));
      // The card's double tap holds a single tap for its window.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('step:s:s1:done:null'));
      expect(find.text('1 of 2'), findsOneWidget);
      // The last box finishes the whole task.
      await tester.tap(find.byKey(const ValueKey('step-check-s2')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('Task s'), findsNothing);
    });

    testWidgets('a double tap checks the next step', (tester) async {
      repo.active = [withSteps()];
      await pump(tester, const TasksTab());
      await tester.tap(find.text('Task s'));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(find.text('Task s'));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('step:s:s1:done:null'));
    });

    testWidgets('the editor adds steps to one task', (tester) async {
      tester.view.physicalSize = const Size(1200, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(uxApp(
        const Scaffold(body: TaskEditorScreen()),
        theme: AppTheme.light(),
        size: const Size(1200, 4000),
        disableAnimations: true,
        overrides: uxOverrides(extra: [
          teamRepositoryProvider.overrideWithValue(repo),
        ]),
      ));
      await tester.pump();
      await tester.enterText(
          find.byKey(const ValueKey('task-title')), 'Monday calls');
      for (final name in ['Brown', 'Lee']) {
        await tester.tap(find.byKey(const ValueKey('task-editor-step-add')));
        await tester.pumpAndSettle();
        await tester.enterText(
            find.byKey(const ValueKey('step-title')), 'Call $name');
        await tester.tap(find.byKey(const ValueKey('step-save')));
        await tester.pumpAndSettle();
      }
      expect(find.text('Call Brown'), findsOneWidget);
      expect(find.text('Call Lee'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('task-save')));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('steps:Call Brown|Call Lee'));
    });
  });

  group('Team', () {
    testWidgets('add an assistant by phone', (tester) async {
      await pump(tester, const TeamScreen());
      expect(find.text('Seats: 0 of 2'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('team-add')));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const ValueKey('team-add-phone')), '+13125550111');
      await tester.enterText(
          find.byKey(const ValueKey('team-add-name')), 'Sam');
      await tester.tap(find.byKey(const ValueKey('team-add-save')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('add:+13125550111:Sam'));
      expect(find.text('Sam'), findsOneWidget);
      expect(find.text('Seats: 1 of 2'), findsOneWidget);
    });

    testWidgets('requests: approve publishes, reject asks for a note',
        (tester) async {
      repo.requestList = [makeRequest('r1'), makeRequest('r2')];
      await pump(tester, const TeamInboxTab());
      expect(find.text('Custody basics'), findsNWidgets(2));
      await tester.tap(find.byKey(const ValueKey('request-approve-r1')));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('approve:r1'));
      expect(find.text('Approved'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('request-reject-r2')));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const ValueKey('reject-note')), 'Not now');
      await tester.tap(find.byKey(const ValueKey('reject-confirm')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('reject:r2:Not now'));
    });
  });

  group('AssistantJoinScreen', () {
    testWidgets('invited: one tap joins', (tester) async {
      repo.me = const AssistantMe(
        state: AssistantState.invited,
        duties: {AssistantDuty.chats},
        attorneyName: 'Ada Counsel',
      );
      await pump(tester, const AssistantJoinScreen(), assistant: true);
      expect(
          find.text('Ada Counsel added you as an assistant'), findsOneWidget);
      expect(find.byKey(const ValueKey('join-accept')), findsOneWidget);
    });

    testWidgets("not added: the attorney's phone gets a code", (tester) async {
      await pump(tester, const AssistantJoinScreen(), assistant: true);
      await tester.enterText(
          find.byKey(const ValueKey('join-phone')), '+13125550101');
      await tester.tap(find.byKey(const ValueKey('join-send')));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('code:+13125550101'));
      expect(find.textContaining("The code went to the attorney's phone"),
          findsOneWidget);
    });
  });
}
