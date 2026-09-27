import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/display/app_icon_medallion.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Shared layout for empty / error / offline states (UI modernization
/// pass, 2026-09-27): tinted medallion, optional serif [title], [message],
/// optional [action] — staggered in, centered, scrollable so it never
/// clips at 200% text scale (file 07 §9).
class AppStateLayout extends StatelessWidget {
  const AppStateLayout({
    required this.icon,
    required this.message,
    super.key,
    this.tone = AppMedallionTone.gold,
    this.title,
    this.action,
    this.illustration,
  });

  /// Replaces the medallion with a richer picture (p12 leaf-1.6, docs/01
  /// §8.3 "Empty (иллюстрация + текст + CTA)") — e.g. the feed's preview
  /// of content cards. Decorative: excluded from semantics.
  final Widget? illustration;

  final IconData icon;
  final AppMedallionTone tone;
  final String? title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.xxl,
                vertical: AppSpacing.xl,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppEntrance(
                    scale: true,
                    child: illustration != null
                        ? ExcludeSemantics(child: illustration)
                        : AppIconMedallion(
                            icon: icon,
                            tone: tone,
                            size: AppSizes.stateMedallion,
                            iconSize: AppSizes.stateIcon,
                          ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  if (title != null) ...[
                    AppEntrance(
                      index: 1,
                      child: Semantics(
                        header: true,
                        child: Text(
                          title!,
                          textAlign: TextAlign.center,
                          style: typography.roleTitle.copyWith(
                            color: colors.text,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  AppEntrance(
                    index: 2,
                    child: Text(
                      message,
                      textAlign: TextAlign.center,
                      style: typography.body.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                  if (action != null) ...[
                    const SizedBox(height: AppSpacing.xl),
                    AppEntrance(
                      index: 3,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          maxWidth: AppSizes.stateActionWidth,
                        ),
                        child: action,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
