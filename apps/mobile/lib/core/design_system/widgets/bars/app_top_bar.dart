import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/bars/header_ink.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Generic top bar (file 01 §15 component list). The Feed screen uses the
/// dedicated `AppFeedHeader` (docs/07 §10: small static ScalesLogo left;
/// the Chats icon with unread badge on the right is file 05's slot).
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({
    super.key,
    this.title,
    this.leading,
    this.actions,
    this.centerTitle = false,
  });

  final Widget? title;
  final Widget? leading;
  final List<Widget>? actions;

  /// Owner 2026-11-05: [title] stands in the very middle of the screen,
  /// whatever is on its sides (the case screen's sections).
  final bool centerTitle;

  @override
  // Owner 2026-10-16 (web): as high as the feed's header, not higher.
  Size get preferredSize =>
      Size.fromHeight(webWideWindow ? AppSizes.feedHeader : 56);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    // Status-bar inset (p12 leaf-1.6): as a `Scaffold.appBar` this widget
    // receives the full top padding (Scaffold only strips it from `body`),
    // and unlike Material's AppBar it did not apply it — the title sat
    // under the status bar / notch on devices. Tests and goldens run with
    // zero padding, so their output is unchanged.
    final topInset = MediaQuery.paddingOf(context).top;
    final bar = Container(
      decoration: headerDecoration(
        fill: colors.headerBg,
        gradient: colors.headerGradient,
      ),
      // Owner 2026-09-30: the back arrow and the right-hand icons sit near
      // the edges (their 48 pt tap targets already give breathing room);
      // a bare title keeps the screen margin.
      padding: EdgeInsetsDirectional.fromSTEB(
        leading != null ? AppSpacing.xs : AppSpacing.screenSide,
        topInset,
        centerTitle || (actions != null && actions!.isNotEmpty)
            ? AppSpacing.xs
            : AppSpacing.screenSide,
        0,
      ),
      height: preferredSize.height + topInset,
      child: centerTitle
          ? _centered(typography, colors)
          : Row(
              children: [
                if (leading != null) ...[
                  leading!,
                  const SizedBox(width: AppSpacing.xs),
                ],
                Expanded(
                  child: DefaultTextStyle(
                    style: typography.titleMedium
                        .copyWith(color: colors.headerInk),
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
    if (!colors.hasHeaderWash) return bar;
    // Blue / Green: white ink on the wash, light status-bar icons.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: HeaderInk(
        pageText: colors.text,
        ink: colors.headerInk,
        child: bar,
      ),
    );
  }

  /// Flutter's own toolbar layout: the middle is centred in the bar and never
  /// runs over the sides. An empty side keeps its width, so the middle does
  /// not lean to it when there is no menu.
  Widget _centered(AppTypographyTokens typography, AppColorTokens colors) {
    final trailing = actions ?? const <Widget>[];
    return NavigationToolbar(
      leading: leading ?? const SizedBox(width: AppSizes.touchTarget),
      trailing: trailing.isEmpty
          ? const SizedBox(width: AppSizes.touchTarget)
          : Row(mainAxisSize: MainAxisSize.min, children: trailing),
      middleSpacing: AppSpacing.xs,
      middle: DefaultTextStyle(
        style: typography.titleMedium.copyWith(color: colors.headerInk),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        child: Semantics(
          header: true,
          child: title ?? const SizedBox.shrink(),
        ),
      ),
    );
  }
}
