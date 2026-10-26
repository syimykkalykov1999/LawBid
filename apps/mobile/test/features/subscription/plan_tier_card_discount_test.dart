import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid/features/subscription/presentation/plan_tier_card.dart';

/// Owner 2026-10-07: «$99 / ~~$149~~ месяц −33%» on the plan card; the
/// card is unchanged when there is no discount.
void main() {
  Future<void> pump(WidgetTester tester, {PriceDiscount? discount}) =>
      tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: PlanTierCard(
                title: 'Адвокат · месяц',
                price: r'$99',
                period: 'в месяц',
                features: const ['Безлимитные ставки'],
                discount: discount,
                formatCents: (c) => '\$${c ~/ 100}',
                translator: const StaticTranslatorRu(),
              ),
            ),
          ),
        ),
      );

  String priceLine(WidgetTester tester) => tester
      .widgetList<RichText>(find.byType(RichText))
      .map((r) => r.text.toPlainText(includeSemanticsLabels: false))
      .firstWhere((s) => s.startsWith(r'$99'));

  testWidgets('shows the old price struck through and the percent',
      (tester) async {
    await pump(
      tester,
      discount: const PriceDiscount(compareAtCents: 14900, percent: 34),
    );
    expect(priceLine(tester), contains(r'/ $149 месяц'));
    expect(find.text('−34%'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('without a discount the line stays as it was', (tester) async {
    await pump(tester);
    expect(priceLine(tester), r'$99  в месяц');
    expect(find.textContaining('%'), findsNothing);
  });
}
