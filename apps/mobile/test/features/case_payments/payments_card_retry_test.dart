import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_card.dart';

import '../../helpers/overflow_payments_fixtures.dart';
import '../../helpers/ux_harness.dart';

/// App audit 2026-10-26 A4: the case payments card vanished without a word
/// when its read failed (no network, a server error). It now keeps its
/// place with the error and the usual «Повторить»; a retry that works
/// shows the card.
class _FailingOnce extends FakePayments {
  _FailingOnce(super.state, this.error);

  final ApiException error;
  int calls = 0;

  @override
  Future<CasePaymentsState> caseState(String caseId) async {
    calls++;
    if (calls == 1) throw error;
    return super.caseState(caseId);
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<_FailingOnce> pump(WidgetTester tester, ApiException error) async {
    final repo = _FailingOnce(payState(attorneySide: false), error);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(
          body: SingleChildScrollView(
            child: CasePaymentsCard(caseId: 'c1', asAttorney: false),
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(
          extra: [
            casePaymentsFlagProvider.overrideWithValue(true),
            casePaymentsRepositoryProvider.overrideWithValue(repo),
          ],
        ),
      ),
    );
    // Before Riverpod's own first retry (200 ms).
    await tester.pump(const Duration(milliseconds: 50));
    return repo;
  }

  testWidgets('a failed read keeps the card with the error and Retry',
      (tester) async {
    final repo = await pump(
      tester,
      const ApiException(code: 'INTERNAL_ERROR', message: 'x', statusCode: 500),
    );
    expect(find.text('Retry'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(repo.calls, greaterThanOrEqualTo(2));
    expect(find.text('Retry'), findsNothing);
    expect(find.byType(CasePaymentsCard), findsOneWidget);
  });

  testWidgets('an assistant without the duty: still no card, no Retry',
      (tester) async {
    await pump(
      tester,
      const ApiException(
        code: ApiErrorCodes.assistantNotAllowed,
        message: 'Only the attorney can do this.',
        statusCode: 403,
      ),
    );
    expect(find.text('Retry'), findsNothing);
  });
}
