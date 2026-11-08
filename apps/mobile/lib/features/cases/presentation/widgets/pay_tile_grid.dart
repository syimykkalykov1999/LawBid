import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// One tile of [PayTileGrid]: an icon (or a one-character [glyph] such as
/// `$` or `%`), a one-word [label] and the [hint] shown under the grid while
/// the tile is selected.
class PayTile<T> {
  const PayTile({
    required this.value,
    required this.name,
    required this.label,
    required this.hint,
    this.icon,
    this.glyph,
  }) : assert(
          icon != null || glyph != null,
          'a tile needs an icon or a glyph',
        );

  final T value;

  /// Stable name for the widget key (`pay-tile-<name>`).
  final String name;
  final String label;
  final String hint;
  final IconData? icon;
  final String? glyph;
}

/// Owner 2026-11-07 (prototypes `budget_prototype_B` and `bid_prototype`):
/// payment kinds as a grid of equal tiles, same look as the chosen / not
/// chosen cards of «Как скоро нужен адвокат?» (gold edge when chosen), and
/// the chosen tile's hint once under the grid.
class PayTileGrid<T> extends StatelessWidget {
  const PayTileGrid({
    required this.tiles,
    required this.value,
    required this.onChanged,
    this.columns = 3,
    this.enabled = true,
    super.key,
  });

  final List<PayTile<T>> tiles;
  final T? value;
  final ValueChanged<T> onChanged;
  final int columns;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;

    Widget tile(PayTile<T> x) {
      final selected = x.value == value;
      return Semantics(
        button: true,
        selected: selected,
        label: '${x.label}. ${x.hint}',
        excludeSemantics: true,
        child: AppPressable(
          key: ValueKey('pay-tile-${x.name}'),
          onTap: enabled ? () => onChanged(x.value) : null,
          child: AnimatedContainer(
            duration: reduce ? Duration.zero : AppMotion.stateChange,
            constraints: const BoxConstraints(minHeight: 72),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.xs,
              vertical: AppSpacing.sm + 2,
            ),
            decoration: BoxDecoration(
              color: selected
                  ? Color.alphaBlend(colors.goldTint, colors.surface)
                  : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(
                color: selected ? colors.gold : colors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colors.iconTintFill,
                    borderRadius: BorderRadius.circular(AppRadii.field),
                  ),
                  child: x.glyph != null
                      ? Text(
                          x.glyph!,
                          style: typography.titleMedium.copyWith(
                            color: selected
                                ? colors.iconTint
                                : colors.textSecondary,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : AppIcon(
                          x.icon,
                          size: 20,
                          color:
                              selected ? colors.iconTint : colors.textSecondary,
                        ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  x.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: typography.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final rows = <Widget>[];
    for (var i = 0; i < tiles.length; i += columns) {
      final slice = tiles.skip(i).take(columns).toList();
      if (rows.isNotEmpty) rows.add(const SizedBox(height: AppSpacing.sm));
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var j = 0; j < columns; j++) ...[
                if (j > 0) const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: j < slice.length ? tile(slice[j]) : const SizedBox(),
                ),
              ],
            ],
          ),
        ),
      );
    }
    final chosen = tiles.where((x) => x.value == value).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...rows,
        if (chosen.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            chosen.first.hint,
            key: const ValueKey('pay-tile-hint'),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ],
    );
  }
}
