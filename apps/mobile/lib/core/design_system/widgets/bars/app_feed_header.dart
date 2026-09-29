import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_fonts.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';

/// Feed top bar. Owner decision 2026-09-29 (OQ-027, replaces docs/07 §10
/// "scales logo left"): a centered TEXT wordmark "LawBid" in the brand
/// serif — like Instagram's wordmark — with the Chats icon on the right
/// and an empty slot of the same width on the left, so the wordmark sits
/// exactly in the middle. The bar is lower than before (56 instead of 76).
///
/// [trailing] is the documented slot for the Chats icon with its unread
/// badge (docs/01 §3.1/§3.2). The status bar is hidden while the signed-in
/// shell is on screen (see `MainShell`), so only the safe-area inset that
/// the platform still reports is applied.
class AppFeedHeader extends StatelessWidget implements PreferredSizeWidget {
  const AppFeedHeader({
    required this.logoSemanticLabel,
    super.key,
    this.trailing = const [],
    this.showLogo = true,
  });

  /// `false` keeps only the screen-reader name of the header.
  final bool showLogo;

  /// The wordmark text and the screen-reader name of the header
  /// (docs/07 §5.1: semantics label "LawBid").
  final String logoSemanticLabel;

  /// Right-aligned actions — the Chats icon + badge goes here.
  final List<Widget> trailing;

  @override
  Size get preferredSize => const Size.fromHeight(AppSizes.feedHeader);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final topInset = MediaQuery.paddingOf(context).top;
    return Container(
      height: AppSizes.feedHeader + topInset,
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide - AppSpacing.xs,
        topInset,
        AppSpacing.screenSide - AppSpacing.xs,
        0,
      ),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        children: [
          // Left slot: empty for now (owner: "пока ничего"), but as wide
          // as the trailing icons so the wordmark is centered.
          const SizedBox(width: AppSizes.touchTarget),
          Expanded(
            child: Center(
              child: Semantics(
                header: true,
                label: logoSemanticLabel,
                excludeSemantics: true,
                child: showLogo
                    ? MediaQuery.withClampedTextScaling(
                        maxScaleFactor: 1.3,
                        child: Text(
                          logoSemanticLabel,
                          maxLines: 1,
                          style: TextStyle(
                            fontFamily: AppFontFamilies.serif,
                            fontSize: AppSizes.feedWordmark,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.4,
                            height: 1,
                            color: colors.text,
                          ),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          ),
          SizedBox(
            width: AppSizes.touchTarget,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: trailing,
            ),
          ),
        ],
      ),
    );
  }
}
