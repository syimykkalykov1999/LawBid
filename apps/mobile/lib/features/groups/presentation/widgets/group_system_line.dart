import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// A centered chip with a service sentence («Ann added Bob»).
class GroupSystemLine extends StatelessWidget {
  const GroupSystemLine({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Center(
        child: Semantics(
          label: text,
          excludeSemantics: true,
          child: Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.86,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs + 1,
            ),
            decoration: BoxDecoration(
              // Glass plates stay translucent (opaque = pale ink on white).
              color: colors.isGlass
                  ? chat.theirs
                  : chat.theirs.withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: chat.theirsBorder),
            ),
            child: Text(
              text,
              textAlign: TextAlign.center,
              style: type.caption.copyWith(
                color: chat.onTheirs,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
