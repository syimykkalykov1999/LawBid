import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/tools/billing_data.dart';
import 'package:lawbid/features/cases/tools/billing_tab.dart';
import 'package:lawbid/features/cases/tools/conflict_banner.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid/features/cases/tools/signing_sheets.dart';
import 'package:lawbid/features/cases/tools/signing_tab.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../features/cases/tools/tools_fixtures.dart';
import '../helpers/long_locale.dart';

/// Owner 2026-10-20 (review): the case tools fit a 360 dp phone in the
/// longest languages (Nepali, German, Arabic, Marathi), right-to-left too,
/// at normal and 1.1 text size: the Time tab, the Docs tab with its sign
/// sheet, and the conflict warning.
const _conflict = api.ConflictCheckDto(
  conflict: true,
  matches: [
    api.ConflictMatchDto(
      kind: api.ConflictMatchDtoKind.formerClient,
      by: api.ConflictMatchDtoBy.phone,
      caseId: 'a',
      caseTitle: 'Wage claim against a very long named employer',
    ),
    api.ConflictMatchDto(
      kind: api.ConflictMatchDtoKind.opposingParty,
      caseId: 'b',
      caseTitle: 'Back pay',
    ),
  ],
);

Future<void> main() async {
  setUpAll(initializeDateFormatting);
  final locales = <String, (String, TextDirection)>{
    'ne': ('ne', TextDirection.ltr),
    'de': ('de', TextDirection.ltr),
    'ar': ('ar', TextDirection.rtl),
    'mr': ('mr', TextDirection.ltr),
  };
  Future<void> pump(
    WidgetTester tester,
    String code,
    TextDirection dir,
    double scale,
    Widget child, {
    List<Override> overrides = const [],
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          translatorProvider.overrideWithValue(ShippedTranslator(code)),
          l10nFormatsProvider
              .overrideWithValue(L10nFormats(AppLanguage.fromCode(code))),
          ...overrides,
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          builder: (context, c) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: Directionality(textDirection: dir, child: c!),
          ),
          home: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
  }

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (code, dir)) in locales.entries) {
      for (final attorney in [true, false]) {
        testWidgets('Time tab, $name, x$scale, attorney=$attorney',
            (tester) async {
          await pump(
            tester,
            code,
            dir,
            scale,
            BillingTab(caseId: 'c', isAttorney: attorney),
            overrides: [
              caseBillingProvider('c')
                  .overrideWith((ref) async => billingDto(attorney: attorney)),
            ],
          );
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        });
      }

      testWidgets('Docs tab and sign sheet, $name, x$scale', (tester) async {
        final pending = signReq(
          'r1',
          'Retainer agreement with a long title',
          api.SignRequestDtoStatus.pending,
          canSign: true,
          canCancel: true,
        );
        await pump(
          tester,
          code,
          dir,
          scale,
          Column(
            children: [
              const SigningTab(caseId: 'c', isAttorney: true),
              Builder(
                builder: (context) => TextButton(
                  key: const ValueKey('open-sign'),
                  onPressed: () =>
                      showSignSheet(context, caseId: 'c', request: pending),
                  child: const Text('open'),
                ),
              ),
            ],
          ),
          overrides: [
            signRequestsProvider('c').overrideWith((ref) async => [pending]),
          ],
        );
        expect(tester.takeException(), isNull);
        await tester.tap(find.byKey(const ValueKey('open-sign')));
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });

      testWidgets('conflict warning, $name, x$scale', (tester) async {
        await pump(
          tester,
          code,
          dir,
          scale,
          const ConflictBanner(caseId: 'c'),
          overrides: [
            conflictCheckProvider('c').overrideWith((ref) async => _conflict),
          ],
        );
        expect(find.byKey(const ValueKey('conflict-banner')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
