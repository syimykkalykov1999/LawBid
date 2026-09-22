import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_spacing.dart';

/// Generic top bar (file 01 §15 component list). The Feed screen's specific
/// header — LawBid scales logo left, Chats icon with unread badge right
/// (file 01 §3.1) — is a stage-1.7+ concern built on top of this once real
/// unread-count data exists; for now stage 1.5's stub screens use the plain
/// `title` slot.
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({super.key, this.title, this.leading, this.actions});

  final Widget? title;
  final Widget? leading;
  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      color: colors.bg,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      height: preferredSize.height,
      child: Row(
        children: [
          if (leading != null) leading!,
          Expanded(
            child: DefaultTextStyle(
              style: typography.titleMedium.copyWith(color: colors.text),
              child: title ?? const SizedBox.shrink(),
            ),
          ),
          if (actions != null) ...actions!,
        ],
      ),
    );
  }
}
