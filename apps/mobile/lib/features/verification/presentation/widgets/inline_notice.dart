import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

enum NoticeTone { info, warning, danger, success }

/// Tinted inline message (verifier message, blockers, privacy note).
class InlineNotice extends StatelessWidget {
  const InlineNotice({
    required this.tone,
    required this.icon,
    required this.message,
    super.key,
    this.title,
    this.action,
  });

  final NoticeTone tone;
  final IconData icon;
  final String? title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (bg, fg) = switch (tone) {
      NoticeTone.info => (colors.goldTint, colors.goldDark),
      NoticeTone.warning => (colors.goldTint, colors.warning),
      NoticeTone.danger => (colors.dangerTint, colors.dangerText),
      NoticeTone.success => (colors.successTint, colors.success),
    };
    return Semantics(
      container: true,
      liveRegion: tone == NoticeTone.danger,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: Border(left: BorderSide(color: fg, width: 3)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ExcludeSemantics(
                child: Icon(icon, size: AppSizes.iconSm, color: fg)),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null) ...[
                    Text(title!,
                        style:
                            typography.roleTitle.copyWith(color: colors.text)),
                    const SizedBox(height: AppSpacing.xs),
                  ],
                  Text(message,
                      style: typography.bodySmall.copyWith(color: colors.text)),
                  if (action != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    action!,
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
