import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_close_block.dart';

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

/// R-392 (owner 2026-11-04): «Закрыть кейс» → the other side confirms
/// («Подтвердить закрытие») or keeps the case in work («Не закрывать»).
void main() {
  setUpAll(initializeDateFormatting);

  Future<FakeCasesRepository> pump(
    WidgetTester tester, {
    required CaseStatus status,
    required bool isAttorney,
    String? requestedBy,
    bool canAct = true,
  }) async {
    final repo = FakeCasesRepository();
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: isAttorney ? attorneyMe() : clientMe(),
      extra: casesOverrides(repo: repo),
    );
    await tester.pumpWidget(
      wrap(
        Scaffold(
          body: SingleChildScrollView(
            child: CaseCloseBlock(
              caseId: 'c1',
              status: status,
              isAttorney: isAttorney,
              requestedBy: requestedBy,
              autoCloseAt: DateTime(2026, 11, 11, 12),
              canAct: canAct,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  const request = ValueKey('case-close-request');
  const confirm = ValueKey('case-close-confirm');
  const decline = ValueKey('case-close-decline');
  const waiting = ValueKey('case-close-waiting');

  for (final isAttorney in [false, true]) {
    final who = isAttorney ? 'attorney' : 'client';
    final other = isAttorney ? 'client' : 'attorney';

    testWidgets('$who, case in work: «Close the case» asks the other side',
        (tester) async {
      final repo = await pump(
        tester,
        status: CaseStatus.inProgress,
        isAttorney: isAttorney,
      );
      expect(find.text('Close the case'), findsOneWidget);
      await tester.tap(find.byKey(request));
      await tester.pumpAndSettle();
      // The confirm sheet, then the request.
      expect(find.text('Close the case?'), findsOneWidget);
      await tester.tap(find.text('Close the case').last);
      await tester.pumpAndSettle();
      expect(repo.calls, contains('complete:c1'));
      expect(find.text('Close request sent'), findsOneWidget);
    });

    testWidgets('$who asked: waits for the other side, no answer buttons',
        (tester) async {
      await pump(
        tester,
        status: CaseStatus.pendingCompletion,
        isAttorney: isAttorney,
        requestedBy: who,
      );
      expect(find.byKey(waiting), findsOneWidget);
      expect(find.textContaining('Nov 11'), findsOneWidget);
      expect(find.byKey(confirm), findsNothing);
      expect(find.byKey(decline), findsNothing);
      expect(find.byKey(request), findsNothing);
    });

    testWidgets('$other asked: $who confirms closing', (tester) async {
      final repo = await pump(
        tester,
        status: CaseStatus.pendingCompletion,
        isAttorney: isAttorney,
        requestedBy: other,
      );
      expect(
        find.textContaining(
          isAttorney
              ? 'The client asks to close the case'
              : 'The attorney asks to close the case',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(confirm));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm closing').last);
      await tester.pumpAndSettle();
      expect(repo.calls, contains('confirmCompletion:c1'));
    });

    testWidgets('$other asked: $who keeps the case open', (tester) async {
      final repo = await pump(
        tester,
        status: CaseStatus.pendingCompletion,
        isAttorney: isAttorney,
        requestedBy: other,
      );
      await tester.tap(find.byKey(decline));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('declineCompletion:c1'));
      expect(find.text('The case stays in work'), findsOneWidget);
    });
  }

  testWidgets('an assistant without «bids» sees the state, not the buttons',
      (tester) async {
    await pump(
      tester,
      status: CaseStatus.pendingCompletion,
      isAttorney: true,
      requestedBy: 'client',
      canAct: false,
    );
    expect(find.textContaining('The client asks'), findsOneWidget);
    expect(find.byKey(confirm), findsNothing);
    expect(find.byKey(decline), findsNothing);
  });

  testWidgets('nothing on an open, closed or disputed case', (tester) async {
    for (final s in [CaseStatus.open, CaseStatus.closed, CaseStatus.disputed]) {
      await pump(tester, status: s, isAttorney: false);
      expect(find.byType(AppButton), findsNothing);
      expect(find.byKey(waiting), findsNothing);
    }
  });
}
