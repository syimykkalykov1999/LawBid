import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

class _Safe implements Translator {
  const _Safe(this.inner);
  final Translator inner;

  @override
  String t(String key, [Map<String, String>? params]) {
    try {
      return inner.t(key, params);
      // ignore: avoid_catching_errors
    } on AssertionError {
      return key;
    }
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      inner.plural(key, count, params);
}

/// Owner 2026-10-15: the search result case is a slim card (practice
/// header, title and one line, paperclip / comments / bids / time): at
/// least four fit under Search's header on a 360 x 780 phone in every
/// language and theme, nothing overflows.
Future<void> main() async {
  await initializeDateFormatting();

  FeedCase kase(int i) => FeedCase(
        id: 'case-$i',
        title: 'A fairly long title of case number $i that must stay on one '
            'line on a narrow phone',
        practice: const PracticeRef(
          id: 'p1',
          code: 'immigration.family_based',
          i18nKey: 'practice.immigration.family_based',
          nameEn: 'Family based',
          categoryI18nKey: 'practice.immigration',
          categoryNameEn: 'Immigration',
          categoryCode: 'immigration',
        ),
        primaryStateCode: 'CA',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1200,
        createdAt: DateTime.now().subtract(const Duration(hours: 7)),
        isNew: false,
        hasOwnBid: false,
        description: 'A long description of the case. ' * 20,
      );

  for (final (code, dir) in const [
    ('en', TextDirection.ltr),
    ('ru', TextDirection.ltr),
    ('de', TextDirection.ltr),
    ('ar', TextDirection.rtl),
  ]) {
    for (final theme in [AppTheme.dark(), AppTheme.light()]) {
      testWidgets('4 search cases fit, $code, ${theme.brightness.name}', (
        t,
      ) async {
        useNarrowPhone(t);
        await t.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: Scaffold(
                body: Column(
                  children: [
                    for (var i = 0; i < 4; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: SearchCaseTile(item: kase(i)),
                      ),
                  ],
                ),
              ),
            ),
            theme: theme,
            size: narrowPhone,
            overrides: uxOverrides(
              translator: _Safe(
                code == 'ru'
                    ? const StaticTranslatorRu()
                    : const StaticTranslatorEn(),
              ),
              extra: [
                l10nFormatsProvider.overrideWithValue(
                  L10nFormats(AppLanguage.fromCode(code)),
                ),
              ],
            ),
          ),
        );
        await t.pump();
        expect(t.takeException(), isNull);
        // Search's chrome takes ~130 dp, the status bar 24, the navbar 64
        // and the list's title 50: four cards must fit in the rest.
        final first =
            t.getRect(find.byKey(const ValueKey('search-case-case-0')));
        final last =
            t.getRect(find.byKey(const ValueKey('search-case-case-3')));
        expect(
          last.bottom - first.top,
          lessThanOrEqualTo(780 - 24 - 130 - 64 - 50),
        );
        expect(
          t.getSize(find.byKey(const ValueKey('search-case-case-0'))).height,
          lessThan(130),
        );
      });
    }
  }
}
