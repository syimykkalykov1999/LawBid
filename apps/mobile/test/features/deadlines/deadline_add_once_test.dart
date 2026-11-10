import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/deadlines/application/deadlines_providers.dart';
import 'package:lawbid/features/deadlines/data/deadlines_repository.dart';
import 'package:lawbid/features/deadlines/domain/deadline_models.dart';
import 'package:lawbid/features/deadlines/presentation/deadline_calculator_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

import '../../helpers/ux_harness.dart';
import '../team/team_fakes.dart';

/// App audit 2026-10-26 A18: «To planner» could add the same deadline twice
/// (a double tap before the button showed its spinner, or a second tap
/// after it was added). One deadline is added once.
const _rule = DeadlineRule(
  code: 'ny-answer',
  jurisdiction: 'NY',
  kind: DeadlineKind.court,
  labels: {'en': 'Answer to a complaint'},
  amount: 20,
  unit: 'day',
  dayType: 'calendar',
  direction: 'after',
  verified: true,
);

class _Deadlines extends DeadlinesRepository {
  _Deadlines() : super(Dio());

  @override
  Future<List<DeadlineRule>> rules({String? jurisdiction}) async => [_rule];

  @override
  Future<DeadlineResult> calculate(String ruleCode, String eventDate) async {
    final at = DateTime.parse(eventDate);
    final due = at.add(const Duration(days: 20));
    return DeadlineResult(
      rule: _rule,
      eventDate: at,
      dueDate: due,
      rawDate: due,
      rolled: false,
      holidays: const [],
      warnings: const <String>{},
    );
  }
}

/// Holds each «create» until [release].
class _SlowTeam extends FakeTeamRepository {
  final _gates = <Completer<void>>[];
  int creates = 0;

  void release() {
    for (final g in _gates) {
      if (!g.isCompleted) g.complete();
    }
  }

  @override
  Future<TaskItem> createTask(TaskDraft draft) async {
    creates++;
    final gate = Completer<void>();
    _gates.add(gate);
    await gate.future;
    return super.createTask(draft);
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<_SlowTeam> pump(WidgetTester tester) async {
    tester.view
      ..physicalSize = const Size(390, 1600)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final team = _SlowTeam();
    await tester.pumpWidget(
      uxApp(
        const DeadlineCalculatorScreen(state: 'NY', caseId: 'c1'),
        theme: AppTheme.light(),
        size: const Size(390, 1600),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            deadlinesRepositoryProvider.overrideWithValue(_Deadlines()),
            teamRepositoryProvider.overrideWithValue(team),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('deadline-add')), findsOneWidget);
    return team;
  }

  testWidgets('a double tap adds the deadline once', (tester) async {
    final team = await pump(tester);
    final add = find.byKey(const ValueKey('deadline-add'));
    await tester.tap(add);
    await tester.tap(add);
    await tester.pump();
    team.release();
    await tester.pump(const Duration(milliseconds: 300));
    expect(team.creates, 1);
  });

  testWidgets('a second tap after it was added does not add it again',
      (tester) async {
    final team = await pump(tester);
    final add = find.byKey(const ValueKey('deadline-add'));
    await tester.tap(add);
    await tester.pump();
    team.release();
    await tester.pump(const Duration(milliseconds: 300));
    expect(team.creates, 1);
    expect(find.text('Added to planner'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5));
    await tester.tap(add);
    await tester.pump();
    team.release();
    await tester.pump(const Duration(milliseconds: 300));
    expect(team.creates, 1);
    // Told again that it is in the planner.
    expect(find.text('Added to planner'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}
