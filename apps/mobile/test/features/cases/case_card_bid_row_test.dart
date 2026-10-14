import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';

import '../../helpers/ux_harness.dart';

/// A static translator that returns the key for the server-only ones.
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

/// Owner 2026-10-14: the Bid button has its own row above the icons; after
/// a bid it turns grey with a short "Bid ✓"; the icon row stays small.
void main() {
  setUpAll(initializeDateFormatting);

  FeedCase kase({required bool bid, String? title, String? desc}) => FeedCase(
        id: 'case-1',
        title: title ?? 'Speeding ticket',
        practice: const PracticeRef(
          id: 'p1',
          code: 'general_practice.not_sure_or_other',
          i18nKey: 'practice.general_practice.not_sure_or_other',
          nameEn: 'Not sure',
        ),
        primaryStateCode: 'CA',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1200000,
        createdAt: DateTime.now().subtract(const Duration(hours: 4)),
        isNew: false,
        hasOwnBid: bid,
        description: desc ?? 'A ticket on I-5, need help.',
      );

  for (final translator in const [
    _Safe(StaticTranslatorEn()),
    _Safe(StaticTranslatorRu()),
  ]) {
    for (final bid in [false, true]) {
      testWidgets('case card at 360dp, bid placed: $bid', (t) async {
        t.view.physicalSize = const Size(360, 740);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        await t.pumpWidget(
          uxApp(
            Scaffold(
              body: SingleChildScrollView(
                child: FeedCaseCard(
                  item: kase(bid: bid),
                  t: translator,
                  formats: L10nFormats(AppLanguage.fallback),
                  onTap: () {},
                ),
              ),
            ),
            theme: AppTheme.dark(),
            size: const Size(360, 740),
            overrides: uxOverrides(translator: translator),
          ),
        );
        await t.pump();
        expect(t.takeException(), isNull);
        final label =
            translator.t(bid ? 'cases.card.bidDone' : 'cases.card.bid');
        expect(find.text(label), findsOneWidget);
        expect(find.textContaining('You placed'), findsNothing);
        // The button is above the icon row.
        final button = t.getTopLeft(find.text(label));
        final icons = t.getTopLeft(find.byIcon(AppIcons.sendOutlined));
        expect(button.dy, lessThan(icons.dy));
        // Icons, comments, time and Save all fit in 360dp.
        expect(
          t.getTopRight(find.byIcon(AppIcons.bookmarkBorderRounded)).dx,
          lessThanOrEqualTo(360),
        );
      });
    }
  }

  testWidgets('two feed cards fit between the header and the navbar',
      (t) async {
    t.view.physicalSize = const Size(360, 780);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final long = kase(
      bid: false,
      title: 'A very long title of a case that needs two full lines of text '
          'on a narrow phone screen to be sure it clamps',
      desc: 'A long description. ' * 30,
    );
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Column(
            children: [
              for (final i in [0, 1])
                FeedCaseCard(
                  key: ValueKey('c$i'),
                  item: long,
                  t: const _Safe(StaticTranslatorEn()),
                  formats: L10nFormats(AppLanguage.fallback),
                  onTap: () {},
                ),
            ],
          ),
        ),
        theme: AppTheme.dark(),
        size: const Size(360, 780),
        overrides: uxOverrides(),
      ),
    );
    await t.pump();
    expect(t.takeException(), isNull);
    final a = t.getRect(find.byKey(const ValueKey('c0')));
    final b = t.getRect(find.byKey(const ValueKey('c1')));
    // No gap between cards (a hairline only), and two cards leave room for
    // the status bar, header, tabs and navbar of a 780dp phone.
    expect(b.top - a.bottom, lessThanOrEqualTo(0.5));
    // ignore: avoid_print
    print('card height ${a.height}');
    expect(b.bottom, lessThanOrEqualTo(780 - 24 - 150 - 64));
  });
}
