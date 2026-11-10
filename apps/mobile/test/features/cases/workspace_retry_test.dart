import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/tools/billing_data.dart';
import 'package:lawbid/features/cases/tools/billing_tab.dart';
import 'package:lawbid/features/cases/workspace/tasks_tab.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';
import 'support/fake_case_files_remote.dart';

/// App audit 2026-10-26 A9 / A16: a failed read of a case tab (Files,
/// History = updates + activity, Tasks, Time) showed a bare line of text
/// with no way to try again, and the task sheet stayed a skeleton for good.
/// Each now shows the error with the usual Retry, and Retry reads again.
const _error =
    ApiException(code: 'INTERNAL_ERROR', message: 'x', statusCode: 500);

/// First read fails, the next ones wait (the loading state).
class _Reads {
  int calls = 0;

  Future<T> next<T>() {
    calls++;
    if (calls == 1) return Future<T>.error(_error);
    return Completer<T>().future;
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pump(
    WidgetTester tester,
    Widget child,
    List<Override> extra,
  ) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: child)),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(extra: extra),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> retry(WidgetTester tester, _Reads reads) async {
    expect(find.text('Retry'), findsOneWidget);
    expect(reads.calls, 1);
    await tester.tap(find.text('Retry'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(reads.calls, 2);
    expect(find.text('Retry'), findsNothing);
  }

  testWidgets('Files: error with Retry', (tester) async {
    final reads = _Reads();
    await pump(tester, const FilesTab(caseId: 'c1', isAttorney: true), [
      caseFilesRemoteProvider.overrideWithValue(
        FakeCaseFilesRemote(const [], onPage: reads.next),
      ),
    ]);
    await retry(tester, reads);
  });

  testWidgets('History: error with Retry', (tester) async {
    final reads = _Reads();
    await pump(tester, const CaseHistoryTab(caseId: 'c1', isAttorney: true), [
      caseUpdatesProvider('c1').overrideWith((ref) => reads.next()),
      caseActivityProvider('c1')
          .overrideWith((ref) async => const <api.CaseActivityDto>[]),
    ]);
    await retry(tester, reads);
  });

  testWidgets('Tasks: error with Retry', (tester) async {
    final reads = _Reads();
    await pump(tester, const TasksTab(caseId: 'c1', isAttorney: true), [
      caseTasksProvider('c1').overrideWith((ref) => reads.next()),
    ]);
    await retry(tester, reads);
  });

  testWidgets('Time: error with Retry', (tester) async {
    final reads = _Reads();
    await pump(tester, const BillingTab(caseId: 'c1', isAttorney: true), [
      caseBillingProvider('c1').overrideWith((ref) => reads.next()),
    ]);
    await retry(tester, reads);
  });

  testWidgets('task sheet: error with Retry, not an endless skeleton',
      (tester) async {
    final reads = _Reads();
    await tester.pumpWidget(
      uxApp(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () =>
                  showTaskSheet(context, caseId: 'c1', taskId: 't1'),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            caseTasksProvider('c1').overrideWith((ref) => reads.next()),
            caseWorkspaceProvider('c1').overrideWith(
              (ref) => Completer<api.CaseWorkspaceDto>().future,
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await retry(tester, reads);
  });
}
