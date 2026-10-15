import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_card.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-15: the «Active» case card must fit at 360 dp with long
/// texts and a large font, in the four themes' light/dark pair.
void main() {
  for (final scale in [1.0, 1.3]) {
    for (final dark in [false, true]) {
      testWidgets('active case card, text x$scale, dark=$dark', (tester) async {
        useNarrowPhone(tester);
        await tester.pumpWidget(
          uxApp(
            Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    ActiveCaseCard(
                      title: 'Защита при обвинении в вождении в нетрезвом '
                          'виде и лишение водительских прав',
                      practiceName: 'Интеллектуальная собственность',
                      stateCode: 'CA',
                      price: r'$1 200',
                      categoryCode: 'criminal_defense',
                      practiceCode: 'criminal_defense.dui',
                      statusLabel: 'Ожидает подтверждения завершения',
                      statusTone: StatusTone.warning,
                      stage: 3,
                      stageLabel: 'Этап 4 из 5: Завершение',
                      next: 'Выберите адвоката: 12 предложений · 15 окт.',
                      nextYours: true,
                      badge: 123,
                      onTap: () {},
                    ),
                    ActiveCaseCard(
                      title: 'С фото в шапке',
                      practiceName: 'Семейное право',
                      stateCode: 'FL',
                      price: r'$250/ч',
                      statusLabel: 'В работе',
                      statusTone: StatusTone.success,
                      stage: 2,
                      stageLabel: 'Этап 3 из 5: В работе',
                      next: 'Продолжайте работу с адвокатом',
                      photoUrl: 'https://example.test/x.jpg',
                      photoCount: 3,
                      onTap: () {},
                    ),
                  ],
                ),
              ),
            ),
            theme: dark ? AppTheme.dark() : AppTheme.light(),
            textScale: scale,
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    }
  }
}
