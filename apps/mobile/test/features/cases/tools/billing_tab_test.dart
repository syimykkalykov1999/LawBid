import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/tools/billing_data.dart';
import 'package:lawbid/features/cases/tools/billing_tab.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

api.CaseBillingDto _dto({required bool attorney, bool noRate = false}) =>
    api.CaseBillingDto(
      role: attorney
          ? api.CaseBillingDtoRole.attorney
          : api.CaseBillingDtoRole.client,
      canEdit: attorney,
      currency: 'USD',
      hourlyRateCents: attorney && !noRate ? 15000 : null,
      timer: attorney && !noRate
          ? api.RunningTimerDto(
              entryId: 'r',
              caseId: 'c',
              caseTitle: 'Case',
              startedAt: DateTime.now().subtract(const Duration(minutes: 3)),
            )
          : null,
      entries: attorney
          ? [
              api.TimeEntryDto(
                id: 'r',
                workedOn: DateTime(2026, 10, 20),
                minutes: 0,
                runningSince: DateTime.now(),
                note: '',
                rateCents: 15000,
                cents: 0,
                invoiceId: null,
              ),
              api.TimeEntryDto(
                id: 'e1',
                workedOn: DateTime(2026, 10, 19),
                minutes: 95,
                runningSince: null,
                note: 'Call with the court clerk about the hearing date',
                rateCents: 15000,
                cents: 23750,
                invoiceId: null,
              ),
            ]
          : const [],
      expenses: attorney
          ? [
              api.ExpenseDto(
                id: 'x1',
                spentOn: DateTime(2026, 10, 19),
                description: 'Court filing fee and courier delivery',
                amountCents: 4500,
                receiptUrl: null,
                receiptPreviewUrl: null,
                invoiceId: null,
              ),
            ]
          : const [],
      unbilled: const api.BillingTotalsDto(
        minutes: 95,
        timeCents: 23750,
        expensesCents: 4500,
        totalCents: 28250,
      ),
      invoices: [
        api.InvoiceDto(
          id: 'i1',
          number: 'LB-3F9A12CD-001',
          createdAt: DateTime(2026, 10, 18),
          currency: 'USD',
          minutes: 60,
          timeCents: 15000,
          expensesCents: 0,
          totalCents: 15000,
          note: null,
          lines: const [],
          url: 'https://example.com/i1.pdf',
          fileId: 'f1',
        ),
      ],
    );

Future<void> main() async {
  await initializeDateFormatting('en');
  for (final attorney in [true, false]) {
    for (final dir in [TextDirection.ltr, TextDirection.rtl]) {
      testWidgets('fits 360 dp at x1.6 text (attorney=$attorney, $dir)', (
        tester,
      ) async {
        tester.view
          ..physicalSize = const Size(360, 1400)
          ..devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              translatorProvider.overrideWithValue(const StaticTranslatorEn()),
              l10nFormatsProvider
                  .overrideWithValue(L10nFormats(AppLanguage.en)),
              caseBillingProvider('c').overrideWith(
                (ref) async => _dto(attorney: attorney),
              ),
            ],
            child: MaterialApp(
              theme: AppTheme.light(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: const TextScaler.linear(1.6)),
                child: Directionality(textDirection: dir, child: child!),
              ),
              home: Scaffold(
                body: SingleChildScrollView(
                  child: BillingTab(caseId: 'c', isAttorney: attorney),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(seconds: 2));
        expect(tester.takeException(), isNull);
        expect(find.text('LB-3F9A12CD-001'), findsOneWidget);
        expect(
          find.text('For information. Payments are not made in the app.'),
          attorney ? findsNothing : findsOneWidget,
        );
        expect(
          find.text('Issue invoice'),
          attorney ? findsOneWidget : findsNothing,
        );
        // Dispose: the ticking timer must stop with the page.
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  testWidgets('Start with no rate asks for the rate first', (tester) async {
    tester.view
      ..physicalSize = const Size(360, 1400)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          translatorProvider.overrideWithValue(const StaticTranslatorEn()),
          l10nFormatsProvider.overrideWithValue(L10nFormats(AppLanguage.en)),
          caseBillingProvider('c').overrideWith(
            (ref) async => _dto(attorney: true, noRate: true),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(
            body: SingleChildScrollView(
              child: BillingTab(caseId: 'c', isAttorney: true),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.text('Start'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Hourly rate'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
