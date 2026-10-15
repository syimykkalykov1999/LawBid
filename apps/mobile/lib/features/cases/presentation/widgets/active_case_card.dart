import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-15 (variant C of the «Моё» mockup): an active case as a
/// card with a progress scale — cover 64 (the client's first photo, else an
/// automatic one: the practice colour, its icon and a glow), the title,
/// «practice · state», an unread badge, five stage ticks in the practice
/// colour, «Этап N из 5: status», the time at the right and a «what to do
/// next» line.
class ActiveCaseCard extends StatelessWidget {
  const ActiveCaseCard({
    required this.title,
    required this.subtitle,
    required this.stage,
    required this.stageLabel,
    required this.timeText,
    required this.next,
    required this.onTap,
    this.nextQuiet = false,
    this.categoryCode,
    this.practiceCode,
    this.coverUrl,
    this.photoCount,
    this.avatarUrl,
    this.badge = 0,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final String subtitle;

  /// 0..4 = how many ticks are lit minus one; null = a draft (no scale).
  final int? stage;
  final String stageLabel;
  final String timeText;
  final String next;
  final bool nextQuiet;
  final String? categoryCode;
  final String? practiceCode;
  final String? coverUrl;
  final int? photoCount;

  /// The client's avatar, a small badge in the cover's corner.
  final String? avatarUrl;
  final int badge;
  final String? semanticLabel;
  final VoidCallback onTap;

  static const double thumb = 64;
  static const int stages = 5;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final accent = practiceAccent(
      practiceCode ?? categoryCode,
      surface: practiceCardBase(colors),
    );
    final onAccent = onPracticeAccent(accent);

    final auto = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [accent, Color.lerp(accent, Colors.black, 0.45)!],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // The glow in the corner.
          Positioned(
            right: -thumb * 0.25,
            top: -thumb * 0.25,
            width: thumb * 0.9,
            height: thumb * 0.9,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    Colors.white.withValues(alpha: 0.28),
                    Colors.white.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          Center(
            child: AppIcon(
              practiceGlyph(categoryCode),
              size: AppSizes.iconLg,
              color: onAccent,
            ),
          ),
        ],
      ),
    );
    final picture = coverUrl != null
        ? CachedNetworkImage(
            imageUrl: coverUrl!,
            fit: BoxFit.cover,
            memCacheWidth: 200,
            placeholder: (_, __) => ColoredBox(color: colors.skeletonBase),
            errorWidget: (_, __, ___) => auto,
          )
        : auto;

    final lit = stage == null ? 0 : stage!.clamp(0, stages - 1) + 1;
    return Semantics(
      button: true,
      label: semanticLabel ?? '$title. $stageLabel. $next',
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          // Owner 2026-10-15: edge to edge like the feed's cards.
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border.symmetric(
              horizontal: BorderSide(color: colors.border),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox.square(
                    dimension: thumb,
                    child: Stack(
                      fit: StackFit.expand,
                      clipBehavior: Clip.none,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadii.card),
                          child: picture,
                        ),
                        if (avatarUrl != null)
                          Positioned(
                            right: -3,
                            bottom: -3,
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: colors.surface,
                                  width: 2,
                                ),
                              ),
                              child: ClipOval(
                                child: CachedNetworkImage(
                                  imageUrl: avatarUrl!,
                                  fit: BoxFit.cover,
                                  memCacheWidth: 72,
                                  errorWidget: (_, __, ___) =>
                                      ColoredBox(color: colors.skeletonBase),
                                ),
                              ),
                            ),
                          ),
                        if ((photoCount ?? 0) > 0)
                          Positioned(
                            left: 4,
                            bottom: 4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.6),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const AppIcon(
                                    AppIcons.imageOutlined,
                                    size: 11,
                                    color: Colors.white,
                                  ),
                                  const SizedBox(width: 2),
                                  Text(
                                    '$photoCount',
                                    style: type.caption.copyWith(
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
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
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  if (badge > 0) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Container(
                      constraints: const BoxConstraints(minWidth: 18),
                      padding: const EdgeInsets.symmetric(horizontal: 5),
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
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  for (var i = 0; i < stages; i++) ...[
                    if (i > 0) const SizedBox(width: 3),
                    Expanded(
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          color: i < lit ? accent : colors.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      stageLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    timeText,
                    maxLines: 1,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Container(
                constraints: const BoxConstraints(minHeight: 32),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: nextQuiet ? colors.chip : colors.goldTint,
                  borderRadius: BorderRadius.circular(AppRadii.card),
                ),
                child: Text(
                  next,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(
                    color: nextQuiet ? colors.textSecondary : colors.goldDark,
                    fontWeight: nextQuiet ? FontWeight.w500 : FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
