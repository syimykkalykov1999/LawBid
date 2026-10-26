import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-19: the buttons and filters added today fit on a 360 dp
/// phone in the longest of all languages, right-to-left, Nepali, Arabic and
/// Russian; the two case buttons stay on one line in Russian.
CaseBid _bid() => CaseBid(
      id: 'bid-1',
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: BidStatus.active,
      feeType: FeeType.fixed,
      amountCents: 60000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 1,
      turn: PartyRole.client,
      createdAt: DateTime(2026, 9, 20),
    );

void main() {
  setUpAll(initializeDateFormatting);
  final locales = <String, (Translator, TextDirection, String)>{
    'longest': (LongestTranslator(), TextDirection.ltr, 'en'),
    'longest rtl': (LongestTranslator(), TextDirection.rtl, 'en'),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr, 'ne'),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl, 'ar'),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
      'ru'
    ),
  };
  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir, code)) in locales.entries) {
      testWidgets("today's buttons at 360 dp ($name, x$scale)", (tester) async {
        useNarrowPhone(tester);
        await tester.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: Scaffold(
                body: ListView(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  children: [
                    BidCard(
                      bid: _bid(),
                      t: t,
                      formats: L10nFormats(AppLanguage.fromCode(code)),
                      onTap: () {},
                    ),
                    const SizedBox(height: 16),
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            child: AppButton(
                              key: const ValueKey('preview'),
                              label: t.t('cases.preview.button'),
                              icon: AppIcons.visibilityOutlined,
                              variant: AppButtonVariant.secondary,
                              onPressed: () {},
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: AppButton(
                              key: const ValueKey('questions'),
                              label: t.t('cases.comments.button'),
                              icon: AppIcons.modeCommentOutlined,
                              variant: AppButtonVariant.secondary,
                              onPressed: () {},
                            ),
                          ),
                        ],
                      ),
                    ),
                    FilterRow(
                      labels: [
                        t.t('cases.files.all'),
                        t.t('cases.files.photos'),
                        t.t('cases.files.fromTasks'),
                        t.t('cases.files.fromUpdates'),
                      ],
                      index: 0,
                      onChanged: (_) {},
                    ),
                  ],
                ),
              ),
            ),
            theme: AppTheme.dark(),
            size: narrowPhone,
            textScale: scale,
            disableAnimations: true,
            overrides: uxOverrides(translator: t),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
        // Both case buttons the same height.
        expect(
          tester.getSize(find.byKey(const ValueKey('preview'))).height,
          tester.getSize(find.byKey(const ValueKey('questions'))).height,
        );
        // No button label wraps to a second line, in any language.
        for (final k in [
          'cases.preview.button',
          'cases.comments.button',
          'bids.card.view',
        ]) {
          final f = find.text(t.t(k));
          if (f.evaluate().isNotEmpty) {
            expect(
              tester.getSize(f.first).height,
              lessThan(24 * scale),
              reason: '$k wrapped',
            );
          }
        }
        if (name == 'ru') {
          // «Просмотр кейса» and «Вопросы по кейсу» on one line each.
          for (final label in ['Просмотр кейса', 'Вопросы']) {
            final h = tester.getSize(find.text(label)).height;
            expect(h, lessThan(24), reason: '$label wrapped');
          }
        }
      });
    }
  }
}
