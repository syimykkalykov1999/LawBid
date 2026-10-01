import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Top bar of profile screens (owner 2026-09-29, Instagram-style): a
/// centered "@handle" between a left slot ([leading] — a back button or
/// the small avatar) and the right [actions]. Both sides are kept the same
/// width so the handle is exactly centered. Used by the Profile tab
/// (`ProfileScreen`) and by `/lawyer/:username` (`AttorneyProfileScreen`).
class ProfileHandleBar extends StatelessWidget implements PreferredSizeWidget {
  const ProfileHandleBar({
    required this.handle,
    super.key,
    this.leading,
    this.actions = const [],
  });

  /// Username without the "@"; null/empty shows no title.
  final String? handle;
  final Widget? leading;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(AppSizes.topBar);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final topInset = MediaQuery.paddingOf(context).top;
    final side = AppSizes.touchTarget * (actions.isEmpty ? 1 : actions.length);
    final text = handle == null || handle!.isEmpty ? '' : '@$handle';
    return Container(
      color: colors.bg,
      // Owner 2026-09-30: arrow / logo and icons near the edges.
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xs,
        topInset,
        AppSpacing.xs,
        0,
      ),
      height: preferredSize.height + topInset,
      child: Row(
        children: [
          SizedBox(
            width: side,
            child: Align(alignment: Alignment.centerLeft, child: leading),
          ),
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                text,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: typography.titleMedium.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          SizedBox(
            width: side,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: actions,
            ),
          ),
        ],
      ),
    );
  }
}
