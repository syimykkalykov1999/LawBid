import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/cases/domain/case_urgency.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';
import 'package:lawbid/features/cases/tools/billing_sheets.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_filter_sheet.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/pending_payment_sheet.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/widgets/search_filters_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/recommended_sheet.dart';
import 'package:lawbid/features/verification/presentation/widgets/license_sheet.dart';

import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02: bottom sheets (filters, rate / time / expense, case
/// urgency, recommended) opened for real on a 360 dp phone with filled
/// values, in the longest translation of every key, right-to-left, Nepali,
/// German, Marathi, Arabic, Russian, at text scale 1 and 1.3. Any overflow
/// fails.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = overflowLocales();

  const longLabel =
      'Intellectual Property and Technology Transactions Law Practice';
  final sheets = <String, Future<void> Function(BuildContext)>{
    for (final kind in SearchFilterKind.values)
      'search filters ${kind.name}': (c) => showSearchFilters(
            c,
            initial: const SearchFilters(
              practiceLabel: longLabel,
              state: 'Massachusetts',
              minRating: 4,
              verifiedOnly: true,
              budgetMin: 1000000,
              budgetMax: 99999999,
            ),
            kind: kind,
          ),
    'qa filter (attorney)': (c) => showQaFilterSheet(
          c,
          current: const QuestionsQuery(practiceLabel: longLabel),
          attorney: true,
        ),
    'qa filter (client)': (c) => showQaFilterSheet(
          c,
          current: const QuestionsQuery(practiceLabel: longLabel),
          attorney: false,
        ),
    'rate': (c) => showRateSheet(
          c,
          currentCents: 123456789,
          currency: 'USD',
        ),
    'time': (c) => showTimeSheet(
          c,
          day: DateTime(2026, 11, 2),
          minutes: 1439,
          note: longLabel * 3,
        ),
    'expense': (c) => showExpenseSheet(c, currency: 'USD'),
    'case urgency': (c) => showCaseUrgencySheet(
          c,
          caseId: 'c1',
          current: CaseUrgencyInfo.none,
        ),
    'recommended': showRecommendedSheet,
    'add license': (c) => AddLicenseSheet.show(c, {'MA', 'NY'}),
    'pending payment': (c) => showPendingPaymentSheet(
          c,
          const CasePromotion(
            id: 'pr1',
            target: PromotionTarget.post,
            postId: 'p1',
            status: PromotionStatus.pendingPayment,
            days: 30,
            totalCents: 999999999,
            impressions: 1000000,
          ),
        ),
  };

  for (final scale in overflowScales) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('sheets: no overflow at 360 dp ($name, x$scale)', () {
        for (final MapEntry(key: label, value: open) in sheets.entries) {
          testWidgets(label, (tester) async {
            await pumpOverflowApp(
              tester,
              Builder(
                builder: (context) => Scaffold(
                  body: Center(
                    child: TextButton(
                      key: const Key('open'),
                      onPressed: () => open(context),
                      child: const Text('open'),
                    ),
                  ),
                ),
              ),
              t: t,
              dir: dir,
              scale: scale,
              act: (tester) async {
                await tester.tap(find.byKey(const Key('open')));
                await tester.pump(const Duration(milliseconds: 600));
                expect(find.byType(BottomSheet), findsOneWidget);
              },
            );
          });
        }
      });
    }
  }
}
