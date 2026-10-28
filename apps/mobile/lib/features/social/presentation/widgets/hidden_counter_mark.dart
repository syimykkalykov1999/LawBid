import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Owner 2026-10-28 (Instagram): next to a like / view counter the author
/// hid — the author still sees the number, others do not. A tiny crossed
/// eye; a long press (and screen readers) say «Скрыто для других».
class HiddenCounterMark extends ConsumerWidget {
  const HiddenCounterMark({
    this.inheritColor = false,
    this.size = 12,
    super.key,
  });

  /// Over a video: the colour of the number next to it (its
  /// [DefaultTextStyle]); otherwise the secondary text colour.
  final bool inheritColor;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final label = ref.watch(translatorProvider).t(
          'post.counts.hiddenForOthers',
        );
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final color = inheritColor
        ? DefaultTextStyle.of(context).style.color ?? colors.textSecondary
        : colors.textSecondary;
    return Tooltip(
      message: label,
      child: Semantics(
        label: label,
        child: Padding(
          padding: const EdgeInsetsDirectional.only(start: 2),
          child: AppIcon(
            AppIcons.visibilityOffOutlined,
            size: size,
            color: color,
          ),
        ),
      ),
    );
  }
}
