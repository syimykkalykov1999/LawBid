import 'package:cached_network_image/cached_network_image.dart';
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
    required this.stage,
    required this.stageLabel,
    required this.next,
    required this.onTap,
    this.stateCode,
    this.price,
    this.nextYours = false,
    this.categoryCode,
    this.practiceCode,
    this.photoUrl,
    this.photoCount,
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

  /// 0..4 = the index of the current stage.
  final int stage;
  final String stageLabel;
  final String next;

  /// The next step is the viewer's: the line is gold.
  final bool nextYours;
  final String? categoryCode;
  final String? practiceCode;

  /// The case's first photo (clients only); null = the practice colour.
  final String? photoUrl;
  final int? photoCount;
  final int badge;
  final String? semanticLabel;
  final VoidCallback onTap;

  static const int stages = 5;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final accent = practiceAccent(
      practiceCode ?? categoryCode,
      surface: practiceCardBase(colors),
    );
    final withPhoto = photoUrl != null;
    final lit = stage.clamp(0, stages - 1) + 1;
    final place = [
      practiceName,
      if (stateCode != null && stateCode!.isNotEmpty) stateCode!,
    ];

    // Owner 2026-10-15: one header height for every card; a case photo is
    // only its dimmed background.
    Widget header() {
      final fg = withPhoto ? Colors.white : accent;
      final sub = withPhoto ? Colors.white70 : colors.textSecondary;
      final label = Row(
        children: [
          AppIcon(practiceGlyph(categoryCode), size: 15, color: fg),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: place.first,
                    style: TextStyle(color: fg, fontWeight: FontWeight.w600),
                  ),
                  if (place.length > 1)
                    TextSpan(
                      text: ' · ${place[1]}',
                      style: TextStyle(color: sub),
                    ),
                ],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption,
            ),
          ),
          if (withPhoto && (photoCount ?? 0) > 0) ...[
            const SizedBox(width: AppSpacing.sm),
            const AppIcon(
              AppIcons.imageOutlined,
              size: 12,
              color: Colors.white70,
            ),
            const SizedBox(width: 2),
            Text(
              '$photoCount',
              style: type.caption.copyWith(color: Colors.white70),
            ),
          ],
          if (price != null) ...[
            const SizedBox(width: AppSpacing.sm),
            Text(
              price!,
              maxLines: 1,
              style: type.bodySmall.copyWith(
                color: withPhoto ? Colors.white : colors.goldDark,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      );
      return Container(
        height: 28,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.15),
          border: Border(
            bottom: BorderSide(color: accent.withValues(alpha: 0.25)),
          ),
        ),
        child: Stack(
          alignment: Alignment.centerLeft,
          fit: StackFit.expand,
          children: [
            if (withPhoto)
              Positioned.fill(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    CachedNetworkImage(
                      imageUrl: photoUrl!,
                      fit: BoxFit.cover,
                      memCacheWidth: 800,
                      placeholder: (_, __) => ColoredBox(color: accent),
                      errorWidget: (_, __, ___) => ColoredBox(color: accent),
                    ),
                    ColoredBox(color: Colors.black.withValues(alpha: 0.5)),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm + 2,
              ),
              child: label,
            ),
          ],
        ),
      );
    }

    return Semantics(
      button: true,
      label: semanticLabel ?? '$title. $stageLabel. $next',
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
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            StatusPill(label: statusLabel, tone: statusTone),
                            const SizedBox(width: AppSpacing.sm),
                            if (badge > 0)
                              Container(
                                constraints: const BoxConstraints(minWidth: 18),
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 5),
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
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Text(
                                stageLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.end,
                                style: type.caption
                                    .copyWith(color: colors.textSecondary),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
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
                          child: Text(
                            next,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(
                              color: nextYours
                                  ? colors.goldDark
                                  : colors.textSecondary,
                              fontWeight:
                                  nextYours ? FontWeight.w600 : FontWeight.w500,
                            ),
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
