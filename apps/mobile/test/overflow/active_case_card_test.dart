import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_card.dart';

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
                      subtitle: 'Уголовное право · Калифорния',
                      categoryCode: 'criminal_defense',
                      practiceCode: 'criminal_defense.dui',
                      stage: 1,
                      stageLabel: 'Этап 2 из 5: Выбор адвоката',
                      timeText: '15 окт.',
                      next: 'Выберите адвоката: 12 предложений от адвокатов',
                      badge: 123,
                      photoCount: 4,
                      onTap: () {},
                    ),
                    ActiveCaseCard(
                      title: 'Черновик',
                      subtitle: '',
                      stage: null,
                      stageLabel: 'Не опубликован',
                      timeText: '',
                      next: 'Дополните и опубликуйте',
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
