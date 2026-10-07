import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';

/// Owner 2026-10-07: the price line with a discount, in the owner's
/// format «$99 / ~~$149~~ month  −33%». Without a discount it is the
/// card's usual «$99  per month». Only spans, so each card keeps its own
/// layout; the line wraps (never overflows) in long languages.
List<InlineSpan> priceSpans({
  required BuildContext context,
  required Translator? t,
  required String price,
  required String period,
  required TextStyle priceStyle,
  required TextStyle periodStyle,
  PriceDiscount? discount,
  String Function(int cents)? format,
  bool yearly = false,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  if (discount == null || format == null || t == null) {
    return [
      TextSpan(text: price, style: priceStyle),
      if (period.isNotEmpty) TextSpan(text: '  $period', style: periodStyle),
    ];
  }
  final old = format(discount.compareAtCents);
  return [
    TextSpan(text: price, style: priceStyle),
    TextSpan(text: ' / ', style: periodStyle),
    TextSpan(
      text: old,
      semanticsLabel: t.t('plans.discount.was', {'price': old}),
      style: periodStyle.copyWith(
        decoration: TextDecoration.lineThrough,
        decorationColor: colors.textSecondary,
        decorationThickness: 1.6,
      ),
    ),
    TextSpan(
      text: ' ${t.t(yearly ? 'plans.discount.year' : 'plans.discount.month')}',
      style: periodStyle,
    ),
    const TextSpan(text: '  '),
    WidgetSpan(
      alignment: PlaceholderAlignment.middle,
      child: DiscountBadge(percent: discount.percent),
    ),
  ];
}

/// The small gold «−33%» pill next to a discounted price.
class DiscountBadge extends StatelessWidget {
  const DiscountBadge({required this.percent, super.key});

  final int percent;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: colors.gold,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        '\u2212$percent%',
        textScaler: TextScaler.noScaling,
        style: typography.caption.copyWith(
          color: AppColorsLight.navy,
          fontWeight: FontWeight.w700,
          height: 1.2,
        ),
      ),
    );
  }
}
