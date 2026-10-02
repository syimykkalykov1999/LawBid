import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Segmented tabs (owner decision 2026-09-29, replaces the scrolling
/// underline row): every tab takes the same width, labels are centered,
/// the row sits in a subtle rounded container with thin separators
/// between the sections, and the selected section is tinted gold with a
/// gold underline. Used by the feed (Posts/Cases), Search (People/Cases/
/// Posts/Topics), Mine and the topic screen.
///
/// Long labels at 200% text shrink to fit their section rather than
/// forcing a horizontal scroll.
class PillTabs<T> extends StatelessWidget {
  const PillTabs({
    required this.value,
    required this.tabs,
    required this.onChanged,
    super.key,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.screenSide,
      AppSpacing.sm,
      AppSpacing.screenSide,
      AppSpacing.sm,
    ),
  });

  final T value;
  final List<(T, String)> tabs;
  final ValueChanged<T> onChanged;

  /// Outer padding around the container.
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final radius = BorderRadius.circular(AppRadii.field);

    return Padding(
      padding: padding,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: radius,
          border: Border.all(color: colors.border),
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: SizedBox(
            height: AppSizes.segmentedTabs,
            child: Row(
              children: [
                for (var i = 0; i < tabs.length; i++) ...[
                  if (i > 0)
                    VerticalDivider(
                      width: 1,
                      thickness: 1,
                      color: colors.border,
                    ),
                  Expanded(
                    child: _Segment(
                      label: tabs[i].$2,
                      selected: tabs[i].$1 == value,
                      motion: motion,
                      colors: colors,
                      typography: typography,
                      onTap: () {
                        if (tabs[i].$1 == value) return;
                        HapticFeedback.selectionClick();
                        onChanged(tabs[i].$1);
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.motion,
    required this.colors,
    required this.typography,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Duration motion;
  final AppColorTokens colors;
  final AppTypographyTokens typography;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          // Owner 2026-09-29 (2nd pass): no gold tint and no underline —
          // the selected section is told apart by bold, darker text only.
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: AnimatedDefaultTextStyle(
                  duration: motion,
                  style: typography.button.copyWith(
                    color: selected ? colors.text : colors.textSecondary,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  textAlign: TextAlign.center,
                  child: Text(label, textAlign: TextAlign.center),
                ),
              ),
            ),
          ),
        ),
      );
}

/// Filter chips row (Active / Archive / Closed …).
class FilterChips<T> extends StatelessWidget {
  const FilterChips({
    required this.value,
    required this.options,
    required this.onChanged,
    super.key,
  });

  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
        child: Row(
          children: [
            for (final (key, label) in options) ...[
              AppChip(
                label: label,
                selected: key == value,
                onTap: () => onChanged(key),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
          ],
        ),
      );
}

/// Owner 2026-10-01: swipe left / right inside a screen moves to the
/// next / previous section (Instagram-like). A swipe that starts at the
/// left edge is left alone — that is "back" (iPhone); horizontal lists
/// inside (chips, photo strips) keep their own scroll, they win the
/// gesture first. Bottom-nav sections never switch by swipe.
class TabSwipe<T> extends StatelessWidget {
  const TabSwipe({
    required this.value,
    required this.values,
    required this.onChanged,
    required this.child,
    super.key,
  });

  final T value;
  final List<T> values;
  final ValueChanged<T> onChanged;
  final Widget child;

  /// The back gesture's strip at the left edge.
  static const edge = 24.0;

  /// A fling this fast (px/s) or a drag this long switches.
  static const _minVelocity = 350.0;
  static const _minDistance = 80.0;

  @override
  Widget build(BuildContext context) {
    double dx = 0;
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        _EdgeAwareDrag: GestureRecognizerFactoryWithHandlers<_EdgeAwareDrag>(
          _EdgeAwareDrag.new,
          (r) => r
            ..onStart = (_) {
              dx = 0;
            }
            ..onUpdate = (d) {
              dx += d.delta.dx;
            }
            ..onEnd = (d) {
              final v = d.primaryVelocity ?? 0;
              final forward = v < -_minVelocity || dx < -_minDistance;
              final backward = v > _minVelocity || dx > _minDistance;
              final i = values.indexOf(value);
              if (i < 0) return;
              final next = forward && !backward
                  ? i + 1
                  : backward && !forward
                      ? i - 1
                      : i;
              if (next == i || next < 0 || next >= values.length) return;
              unawaited(HapticFeedback.selectionClick());
              onChanged(values[next]);
            },
        ),
      },
      child: child,
    );
  }
}

class _EdgeAwareDrag extends HorizontalDragGestureRecognizer {
  @override
  bool isPointerAllowed(PointerEvent event) =>
      event.position.dx > TabSwipe.edge && super.isPointerAllowed(event);
}
