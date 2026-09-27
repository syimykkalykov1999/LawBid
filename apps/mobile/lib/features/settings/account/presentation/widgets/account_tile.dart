import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

enum AccountBadgeTone { gold, success, warning }

/// Small status pill on an [AccountTile] ("Verified", "Primary contact").
class AccountBadge extends StatelessWidget {
  const AccountBadge({required this.label, required this.tone, super.key});

  final String label;
  final AccountBadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (fg, bg) = switch (tone) {
      AccountBadgeTone.gold => (colors.goldDark, colors.goldTint),
      AccountBadgeTone.success => (colors.success, colors.successTint),
      AccountBadgeTone.warning => (colors.danger, colors.dangerTint),
    };
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs / 2,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        label,
        style: typography.caption.copyWith(
          color: fg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Settings → Account row: medallion (icon or brand glyph), title,
/// optional subtitle + status badge, optional trailing action text and
/// chevron when tappable. Same surface/press/radius language as
/// [AppListRow], with the extra subtitle line identifiers need.
class AccountTile extends StatefulWidget {
  const AccountTile({
    required this.title,
    super.key,
    this.icon,
    this.glyph,
    this.subtitle,
    this.badge,
    this.actionLabel,
    this.onTap,
    this.loading = false,
  });

  final IconData? icon;

  /// Brand mark (Apple/Google) used instead of [icon].
  final Widget? glyph;
  final String title;
  final String? subtitle;
  final AccountBadge? badge;
  final String? actionLabel;
  final VoidCallback? onTap;
  final bool loading;

  @override
  State<AccountTile> createState() => _AccountTileState();
}

class _AccountTileState extends State<AccountTile> {
  bool _pressed = false;

  void _set({required bool pressed}) {
    if (widget.onTap == null || _pressed == pressed) return;
    setState(() => _pressed = pressed);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final tappable = widget.onTap != null;

    final leading = widget.glyph != null
        ? ExcludeSemantics(
            child: Container(
              width: AppSizes.rowMedallion,
              height: AppSizes.rowMedallion,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.goldTint,
                shape: BoxShape.circle,
                border:
                    Border.all(color: colors.goldStroke.withValues(alpha: 0.4)),
              ),
              child: IconTheme(
                data: IconThemeData(color: colors.text),
                child: widget.glyph!,
              ),
            ),
          )
        : AppIconMedallion(icon: widget.icon ?? Icons.person_outline_rounded);

    final semantic = [
      widget.title,
      if (widget.subtitle != null) widget.subtitle!,
      if (widget.badge != null) widget.badge!.label,
      if (widget.actionLabel != null) widget.actionLabel!,
    ].join(', ');

    return Semantics(
      button: tappable,
      enabled: tappable || widget.loading,
      label: semantic,
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
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: _pressed ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
          child: Row(
            children: [
              leading,
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.title,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (widget.subtitle != null || widget.badge != null) ...[
                      const SizedBox(height: AppSpacing.xs / 2),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.xs,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (widget.subtitle != null)
                            Text(
                              widget.subtitle!,
                              style: typography.bodySmall.copyWith(
                                color: colors.textSecondary,
                              ),
                            ),
                          if (widget.badge != null) widget.badge!,
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (widget.loading) ...[
                const SizedBox(width: AppSpacing.sm),
                SizedBox.square(
                  dimension: AppSizes.iconSm,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.gold,
                  ),
                ),
              ] else if (tappable) ...[
                if (widget.actionLabel != null) ...[
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    widget.actionLabel!,
                    style: typography.bodySmall.copyWith(
                      color: colors.goldDark,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(width: AppSpacing.xs),
                Icon(
                  Icons.chevron_right_rounded,
                  size: AppSizes.iconSm,
                  color: colors.textSecondary,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
