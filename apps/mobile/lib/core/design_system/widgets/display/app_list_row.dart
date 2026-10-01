import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/display/app_icon_medallion.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';

/// Tappable settings-style row (UI modernization pass, 2026-09-27):
/// medallion icon, label, optional trailing value, chevron. Press shows a
/// gold-tinted highlight (animated, instant under reduce-motion). Min height
/// 56 (≥ 44 touch target) and grows with text scale.
class AppListRow extends StatefulWidget {
  const AppListRow({
    required this.label,
    required this.onTap,
    super.key,
    this.icon,
    this.trailingText,
    this.destructive = false,
    this.selected = false,
    this.showChevron = true,
    this.flush = false,
    this.subtitle,
    this.indent = 0,
  });

  /// A quiet second line under the label (e.g. a subcategory's category).
  final String? subtitle;

  /// Extra left inset for nested options (a subcategory under its
  /// category in a picker).
  final double indent;

  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final String? trailingText;
  final bool destructive;

  /// Selected option in a picker (shows a gold check instead of chevron).
  final bool selected;
  final bool showChevron;

  /// Owner 2026-09-30: a row placed straight on a screen (not inside a
  /// card or a sheet) lines up with the text above — no side inset.
  final bool flush;

  @override
  State<AppListRow> createState() => _AppListRowState();
}

class _AppListRowState extends State<AppListRow> {
  bool _pressed = false;

  void _set({required bool pressed}) {
    if (widget.onTap == null || _pressed == pressed) return;
    setState(() => _pressed = pressed);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final labelColor = widget.destructive ? colors.dangerText : colors.text;
    final highlight = _pressed || widget.selected;

    Widget? trailing;
    if (widget.selected) {
      trailing = AppIcon(
        AppIcons.checkRounded,
        size: AppSizes.iconSm,
        color: colors.goldStroke,
      );
    } else if (widget.showChevron && !widget.destructive) {
      trailing = AppIcon(
        AppIcons.chevronRightRounded,
        size: AppSizes.iconSm,
        color: colors.textSecondary,
      );
    }

    return Semantics(
      button: true,
      selected: widget.selected,
      enabled: widget.onTap != null,
      label: widget.trailingText == null
          ? widget.label
          : '${widget.label}, ${widget.trailingText}',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _set(pressed: true),
        onTapUp: (_) => _set(pressed: false),
        onTapCancel: () => _set(pressed: false),
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          curve: AppMotion.enterCurve,
          constraints: const BoxConstraints(
            minHeight: AppSizes.touchTarget + AppSpacing.md,
          ),
          padding: EdgeInsets.symmetric(
            horizontal: widget.flush ? 0 : AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: highlight ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
          child: Row(
            children: [
              if (widget.icon != null) ...[
                AppIconMedallion(
                  icon: widget.icon!,
                  tone: widget.destructive
                      ? AppMedallionTone.danger
                      : AppMedallionTone.gold,
                ),
                const SizedBox(width: AppSpacing.md),
              ],
              if (widget.indent > 0) SizedBox(width: widget.indent),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.label,
                      style: typography.body.copyWith(
                        color: labelColor,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (widget.subtitle != null)
                      Text(
                        widget.subtitle!,
                        style: typography.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              if (widget.trailingText != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Text(
                  widget.trailingText!,
                  style: typography.bodySmall.copyWith(
                    color: colors.textSecondary,
                  ),
                ),
              ],
              if (trailing != null) ...[
                const SizedBox(width: AppSpacing.xs),
                trailing,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Rounded, hairline-bordered group of [AppListRow]s with an uppercase
/// caption header (iOS-settings rhythm, legal-document restraint).
class AppListSection extends StatelessWidget {
  const AppListSection({
    required this.children,
    super.key,
    this.title,
  });

  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(
              left: AppSpacing.xs,
              bottom: AppSpacing.sm,
            ),
            child: Semantics(
              header: true,
              child: Text(
                title!.toUpperCase(),
                style: typography.caption.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          ),
        DecoratedBox(
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
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xs),
            child: Column(
              children: [
                for (var i = 0; i < children.length; i++) ...[
                  if (i > 0)
                    Divider(
                      height: 1,
                      thickness: 1,
                      indent: AppSpacing.md,
                      endIndent: AppSpacing.md,
                      color: colors.border,
                    ),
                  children[i],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
