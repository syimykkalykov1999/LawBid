import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/cases/workspace/tasks_tab.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';

api.CaseTaskDto _task(String id, api.CaseTaskDtoKind kind, String title) =>
    api.CaseTaskDto(
      id: id,
      kind: kind,
      createdByRole: api.CaseTaskDtoCreatedByRole.client,
      title: title,
      status: api.CaseTaskDtoStatus.open,
      closed: false,
      createdAt: '2026-10-18T10:00:00.000Z',
      fileCount: 0,
      files: const [],
      events: const [],
      items: const [],
      itemsDone: 0,
      itemsTotal: 0,
    );

/// Audit 2026-10-19: a joint task opened as an endless skeleton (the sheet
/// looked for it in every list but the joint one).
Future<void> main() async {
  setUpAll(initializeDateFormatting);

  Future<void> open(WidgetTester tester, api.CaseTasksDto tasks, String id) =>
      tester.pumpWidget(
        uxApp(
          Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () =>
                    showTaskSheet(context, caseId: 'c1', taskId: id),
                child: const Text('open'),
              ),
            ),
          ),
          theme: AppTheme.light(),
          overrides: [
            caseTasksProvider('c1').overrideWith((ref) async => tasks),
            caseWorkspaceProvider('c1').overrideWith(
              (ref) => Completer<api.CaseWorkspaceDto>().future,
            ),
          ],
        ),
      );

  final tasks = api.CaseTasksDto(
    role: api.CaseTasksDtoRole.attorney,
    forClient: const [],
    shared: const [],
    joint: [_task('j1', api.CaseTaskDtoKind.joint, 'Sign the lease')],
    private: const [],
    canEdit: true,
  );

  testWidgets('a joint task opens', (tester) async {
    await open(tester, tasks, 'j1');
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Sign the lease'), findsOneWidget);
    expect(find.text('Joint'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a task that is gone says so instead of loading forever', (
    tester,
  ) async {
    await open(tester, tasks, 'missing');
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('This task is no longer available'), findsOneWidget);
  });
}
