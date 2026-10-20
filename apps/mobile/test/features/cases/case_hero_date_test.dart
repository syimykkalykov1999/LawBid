import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-19: «опубл. 18 окт.» in the case head sits at the right
/// edge of its row, not mid-row.
Future<void> main() async {
  await initializeDateFormatting('ru');
  testWidgets('case head: the publish date is at the right edge', (
    tester,
  ) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: ListView(
            children: [
              CaseHero(
                t: const StaticTranslatorRu(),
                formats: L10nFormats(AppLanguage.ru),
                practiceName: 'Травмы',
                categoryCode: 'personal_injury',
                statusLabel: 'Открыт',
                statusTone: StatusTone.neutral,
                title: 'Поскользнулся в магазине, сломал ногу',
                states: const ['NY'],
                budget: const CaseBudget(mode: BudgetMode.clarifyLater),
                urgency: CaseUrgencyInfo.none,
                stage: 0,
                publishedAt: DateTime(2026, 10, 18),
              ),
            ],
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(360, 800),
      ),
    );
    await tester.pump();
    final date = find.textContaining('опубл.');
    expect(date, findsOneWidget);
    final stage = find.textContaining('Этап 1 из 5');
    final row = find.ancestor(of: date, matching: find.byType(Row)).first;
    final rowRight = tester.getTopRight(row).dx;
    final dateRight = tester.getTopRight(date).dx;
    expect(dateRight, closeTo(rowRight, 1));
    expect(
      tester.getTopLeft(date).dx,
      greaterThan(tester.getTopRight(stage).dx),
    );
  });
}
