import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_sheet.dart';

/// Colour pair (fill, foreground) of a trust level — neutral grey for a
/// self-declared attorney, growing with each check LawBid did itself.
({Color fill, Color fg, Color border}) trustLevelColors(
  AppColorTokens colors,
  int level,
) =>
    switch (TrustLevels.clamp(level)) {
      0 => (
          fill: colors.surface,
          fg: colors.textSecondary,
          border: colors.border
        ),
      1 => (fill: colors.infoTint, fg: colors.info, border: colors.info),
      2 => (
          fill: colors.successTint,
          fg: colors.success,
          border: colors.success
        ),
      _ => (fill: colors.goldTint, fg: colors.goldDark, border: colors.gold),
    };

/// Owner 2026-10-05 — the small trust-level pill next to an attorney's
/// name («Заявлен» / «Реестр» / «Личность» / «Документы»). Tapping it opens
/// [TrustLevelSheet] for [attorneyId] (what was and wasn't checked, registry
/// links); without an id the chip is static.
class TrustLevelChip extends ConsumerWidget {
  const TrustLevelChip({
    required this.level,
    super.key,
    this.attorneyId,
    this.compact = true,
  });

  /// 0..3 (clamped).
  final int level;

  /// Opens the sheet with this attorney's signals when set.
  final String? attorneyId;

  /// Caption-sized pill for cards and list rows; a taller one for headers.
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final lv = TrustLevels.clamp(level);
    final c = trustLevelColors(colors, lv);
    final label = t.t(TrustLevels.nameKey(lv));
    final height = compact ? 22.0 : 28.0;
    final iconSize = compact ? 12.0 : 14.0;
    final style = (compact ? typography.caption : typography.bodySmall)
        .copyWith(color: c.fg, fontWeight: FontWeight.w600);
    final id = attorneyId;
    final onTap = id == null
        ? null
        : () => showTrustLevelSheet(context, attorneyId: id, level: lv);

    final pill = Container(
      height: height,
      padding: EdgeInsets.symmetric(horizontal: compact ? 6 : AppSpacing.sm),
      decoration: BoxDecoration(
        color: c.fill,
        borderRadius: BorderRadius.circular(height / 2),
        border: Border.all(color: c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppIcon(_iconFor(lv), size: iconSize, color: c.fg),
          const SizedBox(width: 3),
          // Shrinks in long languages / tight rows instead of pushing the
          // name away (callers wrap the chip in Flexible).
          Flexible(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: compact ? 96 : 140),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: AlignmentDirectional.centerStart,
                child: Text(label, maxLines: 1, style: style),
              ),
            ),
          ),
        ],
      ),
    );

    return Semantics(
      button: onTap != null,
      label: t.t('trust.chip.label', {'level': label}),
      hint: onTap == null ? null : t.t('trust.chip.hint'),
      excludeSemantics: true,
      child: onTap == null
          ? pill
          : AppTapTarget(
              child: GestureDetector(
                onTap: onTap,
                behavior: HitTestBehavior.opaque,
                child: pill,
              ),
            ),
    );
  }

  static IconData _iconFor(int level) => switch (level) {
        0 => AppIcons.shieldOutlined,
        1 => AppIcons.factCheckOutlined,
        2 => AppIcons.verifiedUserOutlined,
        _ => AppIcons.verifiedRounded,
      };
}

/// The level name for tests and plain-text places (snackbars, errors).
String trustLevelName(Translator t, int level) =>
    t.t(TrustLevels.nameKey(level));
