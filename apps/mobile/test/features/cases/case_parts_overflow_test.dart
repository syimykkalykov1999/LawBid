import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-13: the longest languages (Nepali, Russian, German) and a
/// large system font must never overflow the case's tab row, the chips or
/// the State · Budget · Deadline line.
Future<void> main() async {
  await initializeDateFormatting('en');
  const nepali = [
    'सिंहावलोकन',
    'फाइलहरू',
    'कार्यहरू',
    'अपडेटहरू',
    'गतिविधि',
  ];
  const russian = ['Обзор', 'Файлы', 'Задачи', 'Обновления', 'Активность'];

  for (final scale in [1.0, 1.6]) {
    for (final (name, labels) in [('ne', nepali), ('ru', russian)]) {
      testWidgets('tabs, chips and figures fit at 360 dp ($name, x$scale)', (
        tester,
      ) async {
        var index = 0;
        await tester.pumpWidget(
          uxApp(
            Scaffold(
              body: StatefulBuilder(
                builder: (context, set) => ListView(
                  children: [
                    CaseChipsRow(
                      status: labels.first,
                      labels: [labels[1], labels[2], labels[3]],
                    ),
                    CaseFigures(
                      t: const StaticTranslatorEn(),
                      formats: L10nFormats(AppLanguage.en),
                      states: const ['CA', 'NY', 'TX', 'FL'],
                      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
                      urgency: const CaseUrgencyInfo(),
                    ),
                    CaseTextTabs(
                      items: [
                        for (final (i, l) in labels.indexed)
                          CaseTabItem(l, count: i + 8, locked: i == 1),
                      ],
                      index: index,
                      onChanged: (i) => set(() => index = i),
                    ),
                  ],
                ),
              ),
            ),
            theme: AppTheme.light(),
            size: const Size(360, 800),
            textScale: scale,
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    }
  }
}
