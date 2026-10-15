import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15 («Моё > Активные», the approved mockup): a card like
/// Search → Cases. A header in the practice colour (icon, «practice ·
/// state», the price on the right; for a client with a case photo the photo
/// fills it), a glow in the corner, the title, a status chip with the
/// «Stage N of 5» at the right, a thin stage scale in the practice colour
/// and one «what next» line (gold when the move is the user's).
class ActiveCaseCard extends StatelessWidget {
  const ActiveCaseCard({
    required this.title,
    required this.practiceName,
    required this.statusLabel,
    required this.statusTone,
    required this.next,
    required this.onTap,
    this.stage,
    this.stageLabel,
    this.stateCode,
    this.price,
    this.nextYours = false,
    this.nextDanger = false,
    this.nextDate,
    this.categoryCode,
    this.practiceCode,
    this.badge = 0,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final String practiceName;
  final String? stateCode;
  final String? price;
  final String statusLabel;
  final StatusTone statusTone;

  /// 0..4 = the index of the current stage; null = no scale (Mine lists).
  final int? stage;

  /// At the end of the status row: «Stage N of 5», or the date of a Mine card.
  final String? stageLabel;
  final String next;

  /// Always visible at the right of the one-line «what next».
  final String? nextDate;

  /// The next step is the viewer's: the line is gold.
  final bool nextYours;

  /// The next-step line in the danger colour (a dispute).
  final bool nextDanger;

  final String? categoryCode;
  final String? practiceCode;

  final int badge;
  final String? semanticLabel;
  final VoidCallback onTap;

  static const int stages = 5;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = practiceCardBase(colors);
    final accent = practiceAccent(
      categoryCode ?? practiceCode?.split('.').first,
      surface: base,
    );
    // The header is the practice colour tinted over the card; its text,
    // icon and price are pushed to >= 4.5:1 against that tint, in every
    // theme (Day, Night, Navy, Glass).
    final headerBg = Color.alphaBlend(accent.withValues(alpha: 0.22), base);
    final headerFg = readableOn(accent, headerBg);
    final headerPrice = readableOn(colors.goldDark, headerBg);
    final lit = (stage ?? 0).clamp(0, stages - 1) + 1;
    final nextStyle = type.bodySmall.copyWith(
      color: nextDanger
          ? colors.dangerText
          : nextYours
              ? colors.goldDark
              : colors.textSecondary,
      fontWeight: nextYours || nextDanger ? FontWeight.w600 : FontWeight.w500,
    );

    // Owner 2026-10-15: one header for every card, in the practice colour
    // (no photos): the icon and the practice at the left, «price · state»
    // at the right.
    Widget header() {
      return Container(
        height: 28,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm + 2),
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.22),
          border: Border(
            bottom: BorderSide(color: accent.withValues(alpha: 0.4)),
          ),
        ),
        child: Row(
          children: [
            AppIcon(practiceGlyph(categoryCode), size: 15, color: headerFg),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                practiceName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption
                    .copyWith(color: headerFg, fontWeight: FontWeight.w600),
              ),
            ),
            if (price != null) ...[
              const SizedBox(width: AppSpacing.sm),
              Text(
                price!,
                maxLines: 1,
                style: type.bodySmall.copyWith(
                  color: headerPrice,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      );
    }

    return Semantics(
      button: true,
      label: semanticLabel ?? '$title. ${stageLabel ?? ''}. $next',
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: 4,
          ),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card + 2),
            border: Border.all(color: accent.withValues(alpha: 0.28)),
          ),
          child: Stack(
            children: [
              // The glow in the bottom right corner.
              Positioned(
                right: -64,
                bottom: -64,
                width: 190,
                height: 190,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          accent.withValues(alpha: 0.26),
                          accent.withValues(alpha: 0),
                        ],
                        stops: const [0, 0.68],
                      ),
                    ),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  header(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.sm + 2,
                      AppSpacing.sm,
                      AppSpacing.sm + 2,
                      AppSpacing.sm + 2,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        // Owner 2026-10-15: status chip, new-bids badge and
                        // the state, with «Stage N of 5» at the end; on a
                        // narrow screen the stage drops to the next line.
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          runSpacing: 4,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                StatusPill(
                                  label: statusLabel,
                                  tone: statusTone,
                                ),
                                if (badge > 0) ...[
                                  const SizedBox(width: AppSpacing.sm),
                                  Container(
                                    constraints:
                                        const BoxConstraints(minWidth: 18),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 5,
                                    ),
                                    height: 18,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: colors.gold,
                                      borderRadius: BorderRadius.circular(9),
                                    ),
                                    child: Text(
                                      badge > 99 ? '99+' : '$badge',
                                      style: type.caption.copyWith(
                                        color: Colors.black,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                                if (stateCode != null &&
                                    stateCode!.isNotEmpty) ...[
                                  const SizedBox(width: AppSpacing.sm),
                                  Text(
                                    stateCode!,
                                    maxLines: 1,
                                    style: type.caption.copyWith(
                                      color: colors.textSecondary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            if (stageLabel != null)
                              Text(
                                stageLabel!,
                                maxLines: 1,
                                style: type.caption
                                    .copyWith(color: colors.textSecondary),
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        if (stage != null) ...[
                          Row(
                            children: [
                              for (var i = 0; i < stages; i++) ...[
                                if (i > 0) const SizedBox(width: 3),
                                Expanded(
                                  child: Container(
                                    height: 3,
                                    decoration: BoxDecoration(
                                      color: i < lit ? accent : colors.border,
                                      borderRadius: BorderRadius.circular(2),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 6),
                        ],
                        Container(
                          constraints: const BoxConstraints(minHeight: 30),
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.md,
                            vertical: 6,
                          ),
                          alignment: Alignment.centerLeft,
                          decoration: BoxDecoration(
                            color: nextYours ? colors.goldTint : colors.chip,
                            borderRadius: BorderRadius.circular(AppRadii.card),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  next,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: nextStyle,
                                ),
                              ),
                              if (!nextDanger &&
                                  nextDate != null &&
                                  nextDate!.isNotEmpty) ...[
                                const SizedBox(width: AppSpacing.sm),
                                Text(
                                  nextDate!,
                                  maxLines: 1,
                                  style: nextStyle.copyWith(
                                    color: colors.textSecondary,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
