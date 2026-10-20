import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';

/// A captioned, rounded block of rows on the info screen (WhatsApp style).
class GroupInfoSection extends StatelessWidget {
  const GroupInfoSection({
    required this.children,
    this.title,
    this.trailing,
    super.key,
  });

  final String? title;

  /// Sits at the end of the caption line (e.g. «Add members»).
  final Widget? trailing;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: AppSpacing.xs,
                bottom: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: colors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.card),
              border: Border.all(color: colors.border),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.card),
              child: Column(children: children),
            ),
          ),
        ],
      ),
    );
  }
}

/// A caption under a section (what a switch does).
class GroupInfoNote extends StatelessWidget {
  const GroupInfoNote(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.screenSide + AppSpacing.xs,
        0,
        AppSpacing.screenSide + AppSpacing.xs,
        AppSpacing.md,
      ),
      child: Text(
        text,
        style: type.caption.copyWith(color: colors.textSecondary),
      ),
    );
  }
}

/// A settings row with a switch: medallion, label (+ note), switch.
class GroupInfoSwitchRow extends StatelessWidget {
  const GroupInfoSwitchRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onChanged,
    this.subtitle,
    super.key,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final bool value;

  /// Null disables the switch.
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      toggled: value,
      enabled: onChanged != null,
      label: subtitle == null ? label : '$label, $subtitle',
      excludeSemantics: true,
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onChanged == null ? null : () => onChanged!(!value),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: AppSizes.touchTarget + AppSpacing.sm,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                AppIconMedallion(icon: icon),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: type.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                ExcludeSemantics(
                  child: Switch(
                    value: value,
                    onChanged: onChanged,
                    activeTrackColor: colors.accent,
                    activeThumbColor: colors.onAccent,
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A small round count badge (join requests).
class GroupInfoCountBadge extends StatelessWidget {
  const GroupInfoCountBadge(this.count, {super.key});

  final num count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      constraints: const BoxConstraints(minWidth: 22, minHeight: 22),
      padding: const EdgeInsets.symmetric(horizontal: 7),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.danger,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        context.digits(count),
        style: type.badge.copyWith(color: colors.onDanger),
      ),
    );
  }
}

/// A navigation row with a count badge (join requests): medallion, label,
/// badge, chevron.
class GroupInfoNavRow extends StatelessWidget {
  const GroupInfoNavRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge = 0,
    this.neutral = false,
    super.key,
  });

  final IconData icon;
  final String label;
  final num badge;

  /// A plain grey count (a list size) instead of the alert badge.
  final bool neutral;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: badge > 0 ? '$label, $badge' : label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: AppSizes.touchTarget + AppSpacing.sm,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                AppIconMedallion(icon: icon),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    label,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                if (badge > 0) ...[
                  const SizedBox(width: AppSpacing.sm),
                  if (neutral)
                    Text(
                      '$badge',
                      style: type.bodySmall.copyWith(
                        color: colors.textSecondary,
                      ),
                    )
                  else
                    GroupInfoCountBadge(badge),
                ],
                const SizedBox(width: AppSpacing.xs),
                AppIcon(
                  AppIcons.chevronRightRounded,
                  size: AppSizes.iconSm,
                  color: colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
