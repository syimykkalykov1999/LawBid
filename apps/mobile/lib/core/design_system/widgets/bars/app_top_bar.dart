import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';

/// Generic top bar (file 01 §15 component list). The Feed screen uses the
/// dedicated `AppFeedHeader` (docs/07 §10: small static ScalesLogo left;
/// the Chats icon with unread badge on the right is file 05's slot).
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
    // Status-bar inset (p12 leaf-1.6): as a `Scaffold.appBar` this widget
    // receives the full top padding (Scaffold only strips it from `body`),
    // and unlike Material's AppBar it did not apply it — the title sat
    // under the status bar / notch on devices. Tests and goldens run with
    // zero padding, so their output is unchanged. The offline banner
    // (core/connectivity/offline_banner_host.dart) consumes this inset
    // while it is shown, so the bar never double-pads.
    final topInset = MediaQuery.paddingOf(context).top;
    return Container(
      color: colors.bg,
      // Owner 2026-09-30: the back arrow and the right-hand icons sit near
      // the edges (their 48 pt tap targets already give breathing room);
      // a bare title keeps the screen margin.
      padding: EdgeInsets.fromLTRB(
        leading != null ? AppSpacing.xs : AppSpacing.screenSide,
        topInset,
        actions != null && actions!.isNotEmpty
            ? AppSpacing.xs
            : AppSpacing.screenSide,
        0,
      ),
      height: preferredSize.height + topInset,
      child: Row(
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: AppSpacing.xs),
          ],
          Expanded(
            child: DefaultTextStyle(
              style: typography.titleMedium.copyWith(color: colors.text),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              child: Semantics(
                header: true,
                child: title ?? const SizedBox.shrink(),
              ),
            ),
          ),
          if (actions != null) ...actions!,
        ],
      ),
    );
  }
}
