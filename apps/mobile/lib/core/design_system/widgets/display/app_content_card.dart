import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/display/app_card.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_skeleton.dart';

/// Reusable content card for list items that carry an author/owner, a
/// headline, a short body and tags — the shape shared by feed posts
/// (file 05) and case cards (file 04). Built now (p12 leaf-1.6, owner
/// direction) so those files compose it instead of each inventing a card;
/// today it is used by the feed's empty-state preview (as
/// [AppContentCardSkeleton]) and golden-tested in both themes.
///
/// Layout: [leading] (usually an `AppAvatar`) + serif [title] + [meta]
/// caption, optional [trailing] status, [body] clamped to [bodyMaxLines],
/// then [tags] (usually `AppChip`s). [highlighted] adds the brand's gold
/// edge (e.g. a pinned or PRO item). Tappable cards get the standard
/// press-scale feedback via `AppCard` and are exposed to screen readers as
/// one button whose label is [semanticLabel] (or title + meta + body).
class AppContentCard extends StatelessWidget {
  const AppContentCard({
    required this.title,
    super.key,
    this.leading,
    this.meta,
    this.trailing,
    this.body,
    this.bodyMaxLines = 3,
    this.tags = const [],
    this.highlighted = false,
    this.onTap,
    this.semanticLabel,
  });

  final String title;
  final Widget? leading;
  final String? meta;
  final Widget? trailing;
  final String? body;
  final int bodyMaxLines;
  final List<Widget> tags;
  final bool highlighted;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: AppSpacing.md),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: typography.roleTitle.copyWith(color: colors.text),
                  ),
                  if (meta != null) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      meta!,
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: AppSpacing.sm),
              trailing!,
            ],
          ],
        ),
        if (body != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            body!,
            maxLines: bodyMaxLines,
            overflow: TextOverflow.ellipsis,
            style: typography.body.copyWith(color: colors.text),
          ),
        ],
        if (tags.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: tags,
          ),
        ],
      ],
    );

    final card = AppCard(
      elevated: true,
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: _GoldEdge(
        visible: highlighted,
        color: colors.gold,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: content,
        ),
      ),
    );

    if (onTap == null) return card;
    final label = semanticLabel ??
        [title, if (meta != null) meta!, if (body != null) body!].join('\n');
    return Semantics(
      button: true,
      label: label,
      // excludeSemantics drops the inner GestureDetector's tap action, so
      // it is re-declared here for screen-reader activation.
      onTap: onTap,
      excludeSemantics: true,
      child: card,
    );
  }
}

/// Thin gold bar along the card's leading edge, clipped to its radius.
class _GoldEdge extends StatelessWidget {
  const _GoldEdge({
    required this.visible,
    required this.color,
    required this.child,
  });

  final bool visible;
  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!visible) return child;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.card),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: color, width: AppSpacing.xs),
          ),
        ),
        child: child,
      ),
    );
  }
}

/// Skeleton in the exact shape of an [AppContentCard] — the loading
/// placeholder for card lists and, with `shimmer: false`, the still
/// preview used by empty states (no fake content, just the silhouette).
class AppContentCardSkeleton extends StatelessWidget {
  const AppContentCardSkeleton({super.key, this.shimmer = true});

  final bool shimmer;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: colors.shadow,
            blurRadius: AppSizes.cardShadowBlur,
            offset: const Offset(0, AppSizes.cardShadowOffsetY),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppSkeleton(
                width: AppSizes.cardAvatar,
                height: AppSizes.cardAvatar,
                borderRadius: AppRadii.pill,
                shimmer: shimmer,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FractionallySizedBox(
                      widthFactor: 0.7,
                      child: AppSkeleton(shimmer: shimmer),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    FractionallySizedBox(
                      widthFactor: 0.4,
                      child: AppSkeleton(
                        height: AppSpacing.md,
                        shimmer: shimmer,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppSkeleton(height: AppSpacing.md, shimmer: shimmer),
          const SizedBox(height: AppSpacing.sm),
          FractionallySizedBox(
            widthFactor: 0.85,
            child: AppSkeleton(height: AppSpacing.md, shimmer: shimmer),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              AppSkeleton(
                width: AppSpacing.xxl * 2,
                height: AppSpacing.xl,
                borderRadius: AppRadii.pill,
                shimmer: shimmer,
              ),
              const SizedBox(width: AppSpacing.sm),
              AppSkeleton(
                width: AppSpacing.xxl * 1.5,
                height: AppSpacing.xl,
                borderRadius: AppRadii.pill,
                shimmer: shimmer,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
